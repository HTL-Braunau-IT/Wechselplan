import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'


export async function GET() {
  try {
    const scheduleTimes = await prisma.scheduleTime.findMany({
      orderBy: {
        startTime: 'asc'
      }
    })
    return NextResponse.json(scheduleTimes)
  } catch (error) {
    console.error('Error fetching schedule times:', error)
    return NextResponse.json(
      { error: 'Failed to fetch schedule times' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    // Validate required fields
    if (!data.startTime || !data.endTime || data.hours == null || !data.period) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create new schedule time
    const scheduleTime = await prisma.scheduleTime.create({
      data: {
        startTime: data.startTime,
        endTime: data.endTime,
    const hours = Number(data.hours)
    if (!Number.isFinite(hours) || hours <= 0) {
      return NextResponse.json(
        { error: 'Hours must be a positive number' },
        { status: 400 }
      )
    }

    const scheduleTime = await prisma.scheduleTime.create({
      data: {
        startTime: data.startTime,
        endTime: data.endTime,
        hours,
        period: data.period
      }
    })
      }
    })

    return NextResponse.json(scheduleTime)
  } catch (error) {
    console.error('Error creating schedule time:', error)
    captureError(error, {
      location: 'api/settings/schedule-times',
      type: 'create-schedule-time',
    })
    return NextResponse.json(
      { error: 'Failed to create schedule time' },
      { status: 500 }
    )
  }
} 