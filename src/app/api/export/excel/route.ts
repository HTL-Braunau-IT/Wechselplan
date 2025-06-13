import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

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

/**
 * Handles a POST request to generate and return an Excel file with class schedule and group details.
 *
 * Validates required query parameters, retrieves class, schedule, and teacher assignment data, and constructs an Excel workbook containing grouped student lists, class metadata, schedule dates, and teacher assignments. Returns the generated Excel file as a downloadable macro-enabled attachment, or a JSON error response with an appropriate status code if validation or data retrieval fails.
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

        const class_response = await prisma.class.findUnique({
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
        })

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

        // Create a new workbook
        const workbook = XLSX.utils.book_new()
        
        // Create empty worksheet with proper dimensions
        const worksheet = XLSX.utils.aoa_to_sheet([[]])
        
        // Track maximum row and column indices
        let maxRow = 0
        let maxCol = 0

        // Get students grouped by their group ID
        const studentsByGroup = class_response.students.reduce<Record<number, { name: string }[]>>((acc, student) => {
            const groupId = student.groupId ?? 0
            acc[groupId] ??= []
            acc[groupId].push({
                name: `${student.lastName} ${student.firstName}`
            })
            return acc
        }, {})

        // Fill in the student groups (columns B-E)
        Object.entries(studentsByGroup).forEach(([, students], index) => {
            students.forEach((student, studentIndex) => {
                const cell = XLSX.utils.encode_cell({ r: studentIndex, c: index + 1 }) // Start from column B (index 1)
                worksheet[cell] = { v: student.name, t: 's' } // Explicitly set type as string
                maxRow = Math.max(maxRow, studentIndex)
                maxCol = Math.max(maxCol, index + 1)
            })
        })

        // Add class information
        worksheet.F1 = { v: class_response.name, t: 's' } // Class name
        const teacherName = class_response.classHead 
            ? `${class_response.classHead.firstName} ${class_response.classHead.lastName}`
            : ''
        const leadName = class_response.classLead
            ? `${class_response.classLead.firstName} ${class_response.classLead.lastName}`
            : ''
        worksheet.G1 = { v: teacherName, t: 's' } // Class teacher
        worksheet.H1 = { v: leadName, t: 's' } // Class lead
        maxCol = Math.max(maxCol, 7) // Column H is index 7

        // Add Turnustage headers (columns I-R)
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

        turnustageHeaders.forEach((header, index) => {
            const cell = XLSX.utils.encode_cell({ r: 0, c: index + 8 }) // Start from column I (index 8)
            worksheet[cell] = { v: header, t: 's' }
            maxCol = Math.max(maxCol, index + 8)
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
                        const cell = XLSX.utils.encode_cell({ r: dateIndex + 2, c: turnusIndex + 8 }) // Start from column I (index 8), row 3 (index 2)
                        const [day, month, year] = week.date.split('.')
                        const formattedDate = `${day}.${month}.20${year}`
                        worksheet[cell] = { 
                            v: formattedDate
                        }
                        maxRow = Math.max(maxRow, dateIndex + 2)
                    })
                }
            })
        }

        // Add teacher assignments
        const amAssignments = teacherAssignments.filter(a => a.period === 'AM')
        const pmAssignments = teacherAssignments.filter(a => a.period === 'PM')

        // Write AM teachers (column Q)
        amAssignments.forEach((assignment, index) => {
            const cell = XLSX.utils.encode_cell({ r: index + 2, c: 16 }) // Column Q (index 16)
            worksheet[cell] = { 
                v: `${assignment.teacher.lastName.toUpperCase()} ${assignment.teacher.firstName}`,
                t: 's'
            }
            maxRow = Math.max(maxRow, index + 2)
        })

        // Write PM teachers (column R)
        pmAssignments.forEach((assignment, index) => {
            const cell = XLSX.utils.encode_cell({ r: index + 2, c: 17 }) // Column R (index 17)
            worksheet[cell] = { 
                v: `${assignment.teacher.lastName.toUpperCase()} ${assignment.teacher.firstName}`,
                t: 's'
            }
            maxRow = Math.max(maxRow, index + 2)
        })

        // Set worksheet dimensions based on actual data
        worksheet['!ref'] = `A1:${XLSX.utils.encode_col(maxCol)}${maxRow + 1}`

        // Add the worksheet to the workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Gruppenliste')

        // Generate the Excel file with explicit options
        const excelBuffer = XLSX.write(workbook, { 
            type: 'buffer', 
            bookType: 'xlsm',
            cellStyles: true,
            cellDates: true,
            bookSST: true
        })

        // Return the Excel file
        return new NextResponse(excelBuffer as Buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${className}_gruppenliste.xlsm"`
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
