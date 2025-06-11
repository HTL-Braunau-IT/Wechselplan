import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { captureError } from '@/lib/sentry'

interface TeacherRotationRequest {
  classId: string
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
 * Processes a POST request to update the teacher rotation schedule for a class.
 *
 * Replaces all existing teacher rotation records for the specified class with new AM and PM rotation data provided in the request body. Returns a JSON response indicating success, or an error message with an appropriate HTTP status code if validation fails or an internal error occurs.
 *
 * @returns A JSON response indicating the result of the update operation.
 */
export async function POST(request: Request) {
  try {
    const data = await request.json() as TeacherRotationRequest
    const { classId, turns, amRotation, pmRotation } = data

    if (!classId || !turns || !amRotation || !pmRotation) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Delete existing rotations for this class
    await db.teacherRotation.deleteMany({
      where: {
        classId: parseInt(classId)
      }
    })

    // Save AM rotation
    for (const groupRotation of amRotation) {
      for (let i = 0; i < turns.length; i++) {
        const teacherId = groupRotation.turns[i]
        if (teacherId !== null) {
          await db.teacherRotation.create({
            data: {
              classId: parseInt(classId),
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
          await db.teacherRotation.create({
            data: {
              classId: parseInt(classId),
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
      location: 'api/schedule/teacher-rotation',
      type: 'update-rotation'
    })
    return NextResponse.json(
      { error: 'Failed to update teacher rotation' },
      { status: 500 }
    )
  }
} 