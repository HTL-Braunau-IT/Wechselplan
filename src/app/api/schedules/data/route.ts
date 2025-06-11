import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

/**
 * Handles HTTP GET requests to retrieve schedule, student, rotation, assignment, and class data for a specified teacher and weekday.
 *
 * Extracts the `teacher` (required) and `weekday` (optional, defaults to '0') query parameters from the request URL. Validates the teacher's existence, gathers their assignments, rotation data, class information, schedules for the given weekday, and students in each class. Returns a JSON response with the aggregated data or an appropriate HTTP error if any required information is missing.
 *
 * @returns A {@link NextResponse} containing a JSON object with schedules, students, teacher rotation, filtered assignments, and class information, or an error message with the corresponding HTTP status code.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    try {
        const teacherUsername = searchParams.get('teacher')
        const currentWeekday = searchParams.get('weekday') ?? '0'

        if (!teacherUsername) {
            return NextResponse.json({ error: 'Teacher username is required' }, { status: 400 })
        }
        
        const teacher = await prisma.teacher.findUnique({
            where: {
                username: teacherUsername
            }
        })
        
        if (!teacher) {
            return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
        }

        const assignments = await prisma.teacherAssignment.findMany({
            where: {
                teacherId: teacher.id
            }
        })

        if (!assignments || assignments.length === 0) {
            return NextResponse.json({ error: 'No classes assigned to teacher' }, { status: 404 })
        }

        const teacherRotation = await prisma.teacherRotation.findMany({
            where: {
                teacherId: teacher.id
            }
        })

        if (!teacherRotation || teacherRotation.length === 0) {
            return NextResponse.json({ error: 'No teacher rotation found' }, { status: 404 })
        }

        const classIds = [...new Set(assignments.map(assignment => assignment.classId))]
        const schedules = []
        const students = []
        const classdata: { id: number; name: string }[] = []
        const validClassIds = new Set<number>()

        // First fetch all class data
        for (const classId of classIds) {
            const classInfo = await prisma.class.findUnique({
                where: {
                    id: classId
                }
            })
            if (classInfo) {
                classdata.push(classInfo)
            }
        }

        // Then fetch schedules and students for each class
        for (const classId of classIds) {

            const schedule = await prisma.schedule.findFirst({
                where: {
                    classId: classId,
                    selectedWeekday: parseInt(currentWeekday)
                },
                orderBy: {
                    createdAt: 'desc'
                }
            })
        
            
            // Add schedule if it exists for this weekday
            if (schedule) {
                schedules.push([schedule])
                validClassIds.add(classId)
            } else {
                // Add empty array to maintain index alignment with classIds
                schedules.push([])
            }
            
            // Always fetch students for each class, regardless of schedule
            const student = await prisma.student.findMany({
                where: {
                    classId: classId
                }
            })
            if (student) {
                students.push(student)
            }
        }

        // Filter assignments to only include those with valid schedules for this weekday
        const filteredAssignments = assignments.filter(assignment => 
            validClassIds.has(assignment.classId)
        )



        // Only return error if we have no students
        if (students.flat().length === 0) {
            return NextResponse.json({ error: 'No students found' }, { status: 404 })
        }
        
        return NextResponse.json({
            schedules,
            students,
            teacherRotation,
            assignments: filteredAssignments,
            classdata: classdata
        }, { status: 200 })
    } catch (error) {

        captureError(error, {
            location: 'api/schedules/data',
            type: 'schedule_data_error',
            extra: {
                teacherUsername: searchParams.get('teacher'),
                weekday: searchParams.get('weekday')
            }
        })
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}