import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

/**
 * Handles GET requests to retrieve a teacher by their username.
 *
 * Extracts the `username` query parameter from the request URL and returns the teacher's information if found.
 *
 * @returns A JSON response containing the teacher's information, or an error message with an appropriate HTTP status code.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')

    if (!username) {
      return NextResponse.json(
        { error: 'Username parameter is required' },
        { status: 400 }
      )
    }

    const teacher = await prisma.teacher.findUnique({
      where: { username }
    })

    if (!teacher) {
      return NextResponse.json(
        { error: 'Teacher not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(teacher)
  } catch (error) {
    captureError(error, {
      location: 'api/teachers/by-username',
      type: 'fetch-teacher-by-username'
    })
    return NextResponse.json(
      { error: 'Failed to fetch teacher' },
      { status: 500 }
    )
  }
} 