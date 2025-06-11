import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Handles GET requests to retrieve teacher assignments for a specified class.
 *
 * Extracts the `class` query parameter from the request URL, validates it as a number, and returns a list of teacher assignments with their IDs and periods for the given class.
 *
 * @returns A JSON response containing an array of assignments, or an error message with an appropriate HTTP status code if validation fails or an internal error occurs.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('class')

    if (!classId) {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      )
    }

    const parsedClassId = parseInt(classId)
    if (isNaN(parsedClassId)) {
      return NextResponse.json(
        { error: 'Class ID must be a number' },
        { status: 400 }
      )
    }

    // Get assignments for the specified class
    const assignments = await prisma.teacherAssignment.findMany({
      where: {
        classId: parsedClassId
      },
      select: {
        id: true,
        period: true
      }
    })

    return NextResponse.json(assignments)
  } catch  {

    return NextResponse.json(
      { error: 'Failed to fetch assignments' },
      { status: 500 }
    )
  }
}
 