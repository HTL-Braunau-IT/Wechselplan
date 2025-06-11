import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '~/lib/sentry'

/**
 * Handles GET requests to retrieve all student records, ordered by last name and first name.
 *
 * @returns A JSON response containing the list of students, or an error message with status 500 if the query fails.
 */
export async function GET() {
    try {
        const students = await prisma.student.findMany({
            orderBy: [
                { lastName: 'asc' },
                { firstName: 'asc' }
            ]
        })

        return NextResponse.json(students)
    } catch (error) {
        captureError(error, {
            location: 'api/students/all',   
            type: 'fetch-students'
        })
        return NextResponse.json(
            { error: 'Failed to fetch students' },
            { status: 500 }
        )
    }
} 