import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
 