import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'GET, POST, OPTIONS',
    },
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const className = searchParams.get('className')

  if (!className) {
    return NextResponse.json({ error: 'Class name is required' }, { status: 400 })
  }

    const classId = await prisma.class.findFirst({
        where: {
          name: className
        }
      })
  
      // Get the latest schedule for this class
      const times = await prisma.schedule.findFirst({
        where: {
          classId: classId?.id
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          scheduleTimes: true,
          breakTimes: true
        }
      })
  
      if (!times) {
        return NextResponse.json(
          { error: 'No schedule times found for this class' },
          { status: 404 }
        )
      }

      return NextResponse.json({ times })

  }


export async function POST(request: Request) {
  try {
    const { scheduleTimes, breakTimes, className } = await request.json()

    if (!className) {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      )
    }

    const classId = await prisma.class.findFirst({
      where: {
        name: className
      }
    })

    // Get the latest schedule for this class
    const latestSchedule = await prisma.schedule.findFirst({
      where: {
        classId: classId?.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        scheduleTimes: true,
        breakTimes: true
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
          set: scheduleTimes.map((time: { id: number }) => ({ id: time.id }))
        },
        breakTimes: {
          set: breakTimes.map((time: { id: number }) => ({ id: time.id }))
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
    captureError(error, {
      location: 'api/schedule/times',
      type: 'save-times'
    })
    return NextResponse.json(
      { error: 'Failed to save times' },
      { status: 500 }
    )
  }
} 