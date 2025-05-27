import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
              teacherId,
              turnId: turns[i],
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
              teacherId,
              turnId: turns[i],
              period: 'PM'
            }
          })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving teacher rotation:', error)
    return NextResponse.json(
      { error: 'Failed to save teacher rotation' },
      { status: 500 }
    )
  }
} 