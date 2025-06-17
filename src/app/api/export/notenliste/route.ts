import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import XlsxPopulate from 'xlsx-populate'
import { join } from 'path'
import { readFileSync } from 'fs'

interface Week {
    date: string
    week: string
    isHoliday: boolean
}

interface Turnus {
    name: string
    weeks: Week[]
    holidays: Array<{
        id: number
        name: string
        startDate: string
        endDate: string
        createdAt: string
        updatedAt: string
    }>
}

type ScheduleData = Record<string, Turnus>

interface Student {
    id: number
    firstName: string
    lastName: string
    groupId: number | null
    group?: {
        id: number
        name: string
    }
}

interface Class {
    id: number
    name: string
    students: Student[]
    classHead: {
        firstName: string
        lastName: string
    }
    classLead: {
        firstName: string
        lastName: string
    }
}



/**
 * Handles a POST request to generate and return a macro-enabled Excel file containing class schedule, group, and teacher assignment details.
 *
 * Validates required query parameters, retrieves class and schedule data, and populates an Excel template with grouped student lists, class metadata, schedule dates, and teacher assignments. If a teacher identifier is provided, includes teacher-specific rotation data. Returns the generated Excel file as a downloadable attachment, or a JSON error response with an appropriate HTTP status code if validation or data retrieval fails.
 *
 * @returns A response containing the generated Excel file as an attachment, or a JSON error response with an appropriate HTTP status code if validation or data retrieval fails.
 *
 * @throws {Error} If an unexpected error occurs during Excel file generation or data retrieval, a 500 error response is returned.
 */
export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const className = searchParams.get('className')
        const selectedWeekday = searchParams.get('selectedWeekday')
        const teacher = searchParams.get('teacher')

        if (!selectedWeekday) {
            return NextResponse.json({ error: 'Selected Weekday is required' }, { status: 400 })
        }

        const weekday = Number(selectedWeekday)
        if (isNaN(weekday) || weekday < 1 || weekday > 5) {
            return NextResponse.json({ error: 'Selected Weekday is invalid' }, { status: 400 })
        }

        if (!className) {
            return NextResponse.json({ error: 'Class Name is required' }, { status: 400 })
        }

        const class_response = await prisma.class.findFirst({
            where: { name: className },
            include: {
                classHead: true,
                classLead: true,
                students: {
                    orderBy: [
                        { groupId: 'asc' },
                        { lastName: 'asc' },
                        { firstName: 'asc' }
                    ]
                }
            }
        }) as Class | null

        if (!class_response) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 })
        }

        const schedule = await prisma.schedule.findFirst({
            where: { 
                classId: class_response.id,
                selectedWeekday: weekday
            },
            orderBy: [{ createdAt: 'desc' }],
            select: {
                scheduleData: true,
                additionalInfo: true
            }
        })

        if (!schedule) {
            return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
        }

        // Fetch teacher assignments
        const teacherAssignments = await prisma.teacherAssignment.findMany({
            where: { classId: class_response.id },
            include: {
                teacher: true
            }
        })

        const templatePath = join(process.cwd(), 'src', 'app', 'templates', 'excel', 'NOTENLISTE.xlsm')
        const templateBuffer = readFileSync(templatePath)
        
        const workbook = await XlsxPopulate.fromDataAsync(templateBuffer)
        const sheet = workbook.sheet('DROPDOWNLISTE')

        // Set class information
        sheet.cell('R2').value(className)

        const classHead = class_response.classHead 
            ? `${class_response.classHead.firstName} ${class_response.classHead.lastName}`
            : ''
        const classLeader = class_response.classLead
            ? `${class_response.classLead.firstName} ${class_response.classLead.lastName}`
            : ''

        sheet.cell('S2').value(classHead)
        sheet.cell('T2').value(classLeader)

        // Group students by their group
        const studentsByGroup = class_response.students.reduce<Record<number, { name: string, lastName: string }[]>>((acc, student) => {
            const groupId = student.groupId ?? 0
            acc[groupId] ??= []
            acc[groupId].push({
                name: `${student.lastName} ${student.firstName}`,
                lastName: student.lastName
            })
            return acc
        }, {})

        // Map group IDs to their respective columns and headers
        const groupColumnMap: Record<number, { column: string, header: string }> = {
            1: { column: 'N', header: 'Gruppe1_Import' },
            2: { column: 'O', header: 'Grupe2_Import' },
            3: { column: 'P', header: 'Gruppe3_Import' },
            4: { column: 'Q', header: 'Gruppe4_Import' }
        }

        // Write headers and student names
        Object.entries(groupColumnMap).forEach(([groupId, { column, header }]) => {
            sheet.cell(`${column}1`).value(header)
            
            const students = studentsByGroup[Number(groupId)] ?? []
            const sortedStudents = [...students].sort((a, b) => a.lastName.localeCompare(b.lastName))
            
            sortedStudents.forEach((student, studentIndex) => {
                const row = studentIndex + 2
                const cell = `${column}${row}`
                sheet.cell(cell).value(student.name)
            })
        })

        // Add turnustage headers
        const turnustageHeaders = [
            'Turnustage Gruppe 1',
            'Turnustage Gruppe 2',
            'Turnustage Gruppe 3',
            'Turnustage Gruppe 4',
            'Turnustage Gruppe 5',
            'Turnustage Gruppe 6',
            'Turnustage Gruppe 7',
            'Turnustage Gruppe 8',
            'Lehrer Vormittag',
            'Lehrer Nachmittag'
        ]

        // Helper function to convert column index to letter
        const getColumnLetter = (index: number): string => {
            let column = '';
            while (index >= 0) {
                column = String.fromCharCode(65 + (index % 26)) + column;
                index = Math.floor(index / 26) - 1;
            }
            return column;
        }

        // Add turnustage headers starting from column U (index 20)
        turnustageHeaders.forEach((header, index) => {
            try {
                const column = getColumnLetter(index + 20) // Convert to column letter starting from U
                const cell = sheet.cell(`${column}1`)
                if (cell) {
                    cell.value(header)
                }
            } catch (error) {
                console.error(`Error writing header at column ${index + 20}:`, error)
            }
        })

        // Process schedule data for turns
        if (schedule.scheduleData) {
            const scheduleData = schedule.scheduleData as unknown as ScheduleData
            
            // Process each turnus
            Object.entries(scheduleData).forEach(([, turnus], turnusIndex) => {
                if (turnus.weeks) {
                    // Filter out holidays and sort dates
                    const validDates = turnus.weeks
                        .filter(week => !week.isHoliday)
                        .sort((a, b) => {
                            const [dayA, monthA, yearA] = a.date.split('.').map(Number)
                            const [dayB, monthB, yearB] = b.date.split('.').map(Number)
                            if (!dayA || !monthA || !yearA || !dayB || !monthB || !yearB) return 0
                            return new Date(yearA, monthA - 1, dayA).getTime() - new Date(yearB, monthB - 1, dayB).getTime()
                        })

                    // Write dates to the worksheet starting from row 3
                    validDates.forEach((week, dateIndex) => {
                        try {
                            const column = getColumnLetter(turnusIndex + 20) // Start from column U (index 20)
                            const row = dateIndex + 3
                            const [day, month, year] = week.date.split('.')
                            const formattedDate = `${day}.${month}.20${year}`
                            const cell = sheet.cell(`${column}${row}`)
                            if (cell) {
                                cell.value(formattedDate)
                            }
                        } catch (error) {
                            console.error(`Error writing date at turnus ${turnusIndex}, date ${dateIndex}:`, error)
                        }
                    })
                }
            })
        }

        const amAssignments = teacherAssignments.filter(a => a.period === 'AM')
        const pmAssignments = teacherAssignments.filter(a => a.period === 'PM')

        // Write AM teacher assignments starting from column AC (index 28)
        amAssignments.forEach((assignment, index) => {
            try {
                const column = getColumnLetter(28) // Column AC
                const row = index + 2
                const cell = sheet.cell(`${column}${row}`)
                if (cell) {
                    cell.value(`${assignment.teacher.lastName.toUpperCase()} ${assignment.teacher.firstName}`)
                }
            } catch (error) {
                console.error(`Error writing AM teacher at index ${index}:`, error)
            }
        })

        // Write PM teacher assignments starting from column AD (index 29)
        pmAssignments.forEach((assignment, index) => {
            try {
                const column = getColumnLetter(29) // Column AD
                const row = index + 2
                const cell = sheet.cell(`${column}${row}`)
                if (cell) {
                    cell.value(`${assignment.teacher.lastName.toUpperCase()} ${assignment.teacher.firstName}`)
                }
            } catch (error) {
                console.error(`Error writing PM teacher at index ${index}:`, error)
            }
        })

        // Fetch turn assignments for the teacher if provided
        if (teacher) {
            const [teacherLastName, teacherFirstName] = teacher.split(' ')
            
            // Get the teacher's ID first
            const teacherData = await prisma.teacher.findFirst({
                where: {
                    username: teacher
                }
            })

            if (!teacherData) {
                console.error(`Teacher not found: ${teacherLastName} ${teacherFirstName}`)
                return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

            }

            console.log("teacherData.id", teacherData.id)
            console.log("class_response.id", class_response.id)


            // Get teacher rotations
            const teacherRotations = await prisma.teacherRotation.findMany({
                where: {
                    teacherId: teacherData.id,
                    classId: class_response.id
                }
            })

            console.log(teacherRotations)

            // Group assignments by group
            const assignmentsByGroup = teacherRotations.reduce<Record<number, { groupName: string, period: string }>>((acc, rotation) => {
                const groupId = rotation.groupId
                acc[groupId] ??= {
                    groupName: `Gruppe ${groupId}`,
                    period: rotation.period
                }
                return acc
            }, {})

            // Write group assignments starting from column AG (index 32)
            Object.entries(assignmentsByGroup).forEach(([groupId, {  period }], groupIndex) => {
                try {
                    // Write group header
                    const headerColumn = getColumnLetter(32 + groupIndex) // Start from AG
                    sheet.cell(`${headerColumn}1`).value(`Gruppe ${groupId} (${period})`)

                    // Get dates for this group's period
                    const dates: string[] = []
                    if (schedule.scheduleData) {
                        const scheduleData = schedule.scheduleData as unknown as ScheduleData
                        
                        // Get all turns where this teacher is assigned to this group
                        const relevantTurns = teacherRotations
                            .filter(rotation => rotation.groupId === Number(groupId))
                            .map(rotation => rotation.turnId)

                        console.log('Group ID:', groupId)
                        console.log('Teacher Rotations:', teacherRotations)
                        console.log('Relevant Turns:', relevantTurns)
                        console.log('Schedule Data:', scheduleData)

                        // For each relevant turn, get its dates
                        relevantTurns.forEach(turnId => {
                            // turnId already contains "TURNUS", so we use it directly
                            const turnus = scheduleData[turnId]
                            
                            console.log('Processing Turn:', turnId)
                            console.log('Turnus Data:', turnus)
                            
                            const validDates = turnus?.weeks
                                ?.filter(week => !week.isHoliday)
                                .sort((a, b) => {
                                    const [dayA, monthA, yearA] = a.date.split('.').map(Number)
                                    const [dayB, monthB, yearB] = b.date.split('.').map(Number)
                                    if (!dayA || !monthA || !yearA || !dayB || !monthB || !yearB) return 0
                                    return new Date(yearA, monthA - 1, dayA).getTime() - new Date(yearB, monthB - 1, dayB).getTime()
                                })
                                .map(week => {
                                    const [day, month, year] = week.date.split('.')
                                    return `${day}.${month}.20${year}`
                                }) ?? []
                            
                            console.log('Valid Dates for Turn:', validDates)
                            dates.push(...validDates)
                        })

                        // Sort all dates chronologically
                        dates.sort((a, b) => {
                            const [dayA, monthA, yearA] = a.split('.').map(Number)
                            const [dayB, monthB, yearB] = b.split('.').map(Number)
                            if (!dayA || !monthA || !yearA || !dayB || !monthB || !yearB) return 0
                            return new Date(yearA, monthA - 1, dayA).getTime() - new Date(yearB, monthB - 1, dayB).getTime()
                        })

                        console.log('Final Sorted Dates:', dates)
                    }

                    // Write dates
                    dates.forEach((date, dateIndex) => {
                        const row = dateIndex + 2
                        const cell = sheet.cell(`${headerColumn}${row}`)
                        if (cell) {
                            cell.value(date)
                        }
                    })
                } catch (error) {
                    console.error(`Error writing group ${groupId} assignments:`, error)
                }
            })
        }

        // Export the modified workbook
        const modifiedBuffer = await workbook.outputAsync()

        return new NextResponse(modifiedBuffer as Buffer, {
            headers: {
                'Content-Type': 'application/vnd.ms-excel.sheet.macroEnabled.12',
                'Content-Disposition': `attachment; filename="${className}_notenliste.xlsm"`
            }
        })
    } catch (error) {
        console.error('Error generating Excel:', error)
        captureError(error, {
            location: 'api/export',
            type: 'export-schedule'
        })
        return NextResponse.json({ error: 'Failed to generate Excel file' }, { status: 500 })
    }
}
