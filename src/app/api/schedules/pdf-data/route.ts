import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

/**
 * Handles HTTP GET requests to retrieve students belonging to a specified class.
 *
 * Extracts the `className` query parameter from the request URL and returns a JSON response containing students in that class who have a non-null group ID. Responds with a 400 status and error message if the class name is missing, the class does not exist, or no students are found. Returns a 500 status with a generic error message for unexpected server errors.
 *
 * @returns A JSON response with a list of students and a 200 status on success, or an error message with a 400 or 500 status on failure.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    try {
        const className = searchParams.get('className')
        console.log("PDF DATA: ", className)

        if (!className) {
            const error = new Error('Class Name is required')
            captureError(error, {
                location: 'api/schedules/pdf-data',
                type: 'pdf-data-error'
            })
            return NextResponse.json({ error: 'Class Name is required' }, { status: 400 })
        } 

        const class_response = await prisma.class.findUnique({
            where: {
                name: className
            }
        })

        if (!class_response) {
            const error = new Error('Class not found')
            captureError(error, {
                location: 'api/schedules/pdf-data',
                type: 'pdf-data-error'
            })
            return NextResponse.json({ error: 'Class not found' }, { status: 400 })
        }
        const student_response = await prisma.student.findMany({
            where: {
                classId: class_response.id,
                groupId: {
                    not: null
                }
            }
        })

        if (!student_response) {
            const error = new Error('No students found')
            captureError(error, {
                location: 'api/schedules/pdf-data',
                type: 'pdf-data-error'
            })
            return NextResponse.json({ error: 'No students found' }, { status: 400 })
        }
        
        
        

 
        
        return NextResponse.json({
            students: student_response
        }, { status: 200 })
    } catch (error) {
        console.error('Error fetching schedule data:', error)
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