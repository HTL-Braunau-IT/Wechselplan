import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const { scheduleTimes, breakTimes, classId } = await request.json()

    if (!classId) {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      )
    }

    // Get the latest schedule for this class
    const latestSchedule = await prisma.schedule.findFirst({
      where: {
        classId: parseInt(classId)
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (!latestSchedule) {
      return NextResponse.json(
        { error: 'No schedule found for this class' },
        { status: 404 }
      )
    }

    // Update the schedule with the selected times
    const updatedSchedule = await prisma.schedule.update({
      where: {
        id: latestSchedule.id
      },
      data: {
        scheduleTimes: {
          set: scheduleTimes.map((id: string) => ({ id: parseInt(id) }))
        },
        breakTimes: {
          set: breakTimes.map((id: string) => ({ id: parseInt(id) }))
        }
      },
      include: {
        scheduleTimes: true,
        breakTimes: true
      }
    })

    return NextResponse.json(updatedSchedule)
  } catch (error) {
    console.error('Error saving times:', error)
    return NextResponse.json(
      { error: 'Failed to save times' },
      { status: 500 }
    )
  }
} 