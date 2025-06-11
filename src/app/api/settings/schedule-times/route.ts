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
    captureError(error, {
      location: 'api/settings/schedule-times',
      type: 'fetch-schedule-times'
    })
    return NextResponse.json(
      { error: 'Failed to fetch schedule times' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  // Clone the request for error logging
  const requestClone = request.clone()
  
  try {
    const body = await request.json()
    const { startTime, endTime, hours, period } = body

    // Validate required fields
    if (!startTime || !endTime || !hours || !period) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate period
    if (period !== 'AM' && period !== 'PM') {
      return NextResponse.json(
        { error: 'Invalid period. Must be AM or PM' },
        { status: 400 }
      )
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(startTime as string) || !timeRegex.test(endTime as string)) {
      return NextResponse.json(
        { error: 'Invalid time format. Use HH:mm' },
        { status: 400 }
      )
    }

    // Validate hours
    if (hours <= 0) {
      return NextResponse.json(
        { error: 'Hours must be greater than 0' },
        { status: 400 }
      )
    }

    const scheduleTime = await prisma.scheduleTime.create({
      data: {
        startTime,
        endTime,
        hours,
        period
      }
    })

    return NextResponse.json(scheduleTime)
  } catch (error) {
    console.error('Error creating schedule time:', error)
    captureError(error, {
      location: 'api/settings/schedule-times',
      type: 'create-schedule-time',
      extra: {
        requestBody: await requestClone.text()
      }
    })
    return NextResponse.json(
      { error: 'Failed to create schedule time' },
      { status: 500 }
    )
  }
} 