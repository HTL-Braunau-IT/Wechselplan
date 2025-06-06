import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

export async function GET() {
  try {
    const breakTimes = await prisma.breakTime.findMany({
      orderBy: {
        startTime: 'asc'
      }
    })
    return NextResponse.json(breakTimes)
  } catch (error) {
    console.error('Error fetching break times:', error)
    captureError(error, {
      location: 'api/settings/break-times',
      type: 'fetch-break-times'
    })
    return NextResponse.json(
      { error: 'Failed to fetch break times' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, startTime, endTime, period } = body

    // Validate required fields
    if (!name || !startTime || !endTime || !period) {
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
    if (!timeRegex.test(startTime as string) || !timeRegex.test(endTime as string )) {
      return NextResponse.json(
        { error: 'Invalid time format. Use HH:mm' },
        { status: 400 }
      )
    }

    const breakTime = await prisma.breakTime.create({
      data: {
        name,
        startTime,
        endTime,
        period
      }
    })

    return NextResponse.json(breakTime)
  } catch (error) {
    console.error('Error creating break time:', error)
    captureError(error, {
      location: 'api/settings/break-times',
      type: 'create-break-time',
      extra: {
        requestBody: await request.text()
      }
    })
    return NextResponse.json(
      { error: 'Failed to create break time' },
      { status: 500 }
    )
  }
} 