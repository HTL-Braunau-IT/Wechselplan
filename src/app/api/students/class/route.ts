import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '~/lib/sentry'
/**
 * Processes a GET request to retrieve the class name assigned to a student by username.
 *
 * Extracts the `username` query parameter from the request URL and returns the student's class name in a JSON response. Responds with an error message and appropriate HTTP status code if the username is missing, the student does not exist, or the student has no class assigned.
 *
 * @returns A JSON response containing the class name, or an error message with the corresponding HTTP status code.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')

    if (!username) {
        return NextResponse.json(
            { error: 'Username parameter is required' },
            { status: 400 }
        )
    }

    try {
        // Find the student by username
        const student = await prisma.student.findUnique({
            where: { username },
            include: {
                class: true
            }
        })

        if (!student) {
            return NextResponse.json(
                { error: 'Student not found' },
                { status: 404 }
            )
        }

        if (!student.class) {
            return NextResponse.json(
                { error: 'Student has no class assigned' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            class: student.class.name
        })
    } catch (error) {
        captureError(error, {
            location: 'api/students/class',
            type: 'fetch-student-class'
        })
        return NextResponse.json(
            { error: 'Failed to fetch student class' },
            { status: 500 }
        )
    }
} 