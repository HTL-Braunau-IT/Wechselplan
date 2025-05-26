import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface TeacherRotation {
  groupId: number
  turns: (number | null)[]
}

interface TeacherRotationRequest {
  classId: string
  turns: string[]
  amRotation: TeacherRotation[]
  pmRotation: TeacherRotation[]
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

    // Delete existing assignments for this class
    await prisma.teacherAssignment.deleteMany({
      where: {
        classId: parseInt(classId)
      }
    })

    // Create new assignments for AM
    for (const rotation of amRotation) {
      for (let i = 0; i < rotation.turns.length; i++) {
        const teacherId = rotation.turns[i]
        if (typeof teacherId === 'number') {
          await prisma.teacherAssignment.create({
            data: {
              classId: parseInt(classId),
              groupId: rotation.groupId,
              teacherId,
              period: 'AM',
              turnIndex: i
            }
          })
        }
      }
    }

    // Create new assignments for PM
    for (const rotation of pmRotation) {
      for (let i = 0; i < rotation.turns.length; i++) {
        const teacherId = rotation.turns[i]
        if (typeof teacherId === 'number') {
          await prisma.teacherAssignment.create({
            data: {
              classId: parseInt(classId),
              groupId: rotation.groupId,
              teacherId,
              period: 'PM',
              turnIndex: i
            }
          })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving teacher rotations:', error)
    return NextResponse.json(
      { error: 'Failed to save teacher rotations' },
      { status: 500 }
    )
  }
} 