import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

/**
 * Handles GET requests to retrieve students in a specified class who have a non-null group ID.
 *
 * Extracts the `className` query parameter from the request URL and returns a JSON response with the list of students in that class. Responds with a 400 status if the class name is missing or the class does not exist, a 404 status if no students are found, and a 500 status for unexpected errors.
 *
 * @returns A JSON response containing the list of students with a 200 status on success, or an error message with an appropriate status code on failure.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    try {
        const className = searchParams.get('className')


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

        if (student_response.length === 0) {
            const error = new Error('No students found')
            captureError(error, {
                location: 'api/schedules/pdf-data',
                type: 'pdf-data-error'
            })
            return NextResponse.json({ error: 'No students found' }, { status: 404 })
        }

        return NextResponse.json({
            students: student_response
        }, { status: 200 })
    } catch (error) {

        captureError(error, {
            location: 'api/schedules/data',
            type: 'pdf_data_error',
            extra: { className: searchParams.get('className') }
        })
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}