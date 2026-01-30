import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

interface TeacherRotationRequest {
  classId: number
  turns: string[]
  amRotation: {
    groupId: number
    turns: (number | null)[]
  }[]
  pmRotation: {
    groupId: number
    turns: (number | null)[]
  }[]
}

/**
 * Handles a POST request to update the teacher rotation schedule for a class.
 *
 * Replaces all existing teacher rotation records for the specified class with new AM and PM rotation data provided in the request body. Responds with a JSON object indicating success, or an error message with an appropriate HTTP status code if validation fails, the class is not found, or an internal error occurs.
 *
 * @returns A JSON response indicating success or providing an error message.
 */
export async function POST(request: Request) {
  try {
    const data = await request.json() as TeacherRotationRequest
    const { classId, turns, amRotation, pmRotation } = data

    if (!classId || typeof classId !== 'number' || !turns || !amRotation || !pmRotation) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const classData = await prisma.class.findUnique({
      where: {
        id: classId
      }
    })

    if (!classData) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      )
    }

    // Delete existing rotations for this class
    await prisma.teacherRotation.deleteMany({
      where: {
        classId: classData.id
      }
    })

    // Save AM rotation
    for (const groupRotation of amRotation) {
      for (let i = 0; i < turns.length; i++) {
        const teacherId = groupRotation.turns[i]
        if (teacherId !== null) {
          await prisma.teacherRotation.create({
            data: {
              classId: classData.id,
              groupId: groupRotation.groupId,
              teacherId: teacherId!,
              turnId: turns[i]!,
              period: 'AM'
            }
          })
        }
      }
    }

    // Save PM rotation
    for (const groupRotation of pmRotation) {
      for (let i = 0; i < turns.length; i++) {
        const teacherId = groupRotation.turns[i]
        if (teacherId !== null) {
          await prisma.teacherRotation.create({
            data: {
              classId: classData.id,
              groupId: groupRotation.groupId,
              teacherId: teacherId!,
              turnId: turns[i]!,
              period: 'PM'
            }
          })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
  
    captureError(error, {
      location: 'api/schedules/rotation',
      type: 'update-rotation'
    })
    return NextResponse.json(
      { error: 'Failed to update teacher rotation' },
      { status: 500 }
    )
  }
}

