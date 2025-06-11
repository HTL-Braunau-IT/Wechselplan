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

    captureError(error, {
      type: 'fetch-break-times',
      location: 'api/settings/break-times'
    })
    return NextResponse.json(
      { error: 'Failed to fetch break times' },
      { status: 500 }
    )
  }
}

interface BreakTimeRequest {
  name: string
  startTime: string
  endTime: string
  period: 'AM' | 'PM'
}

export async function POST(request: Request) {
  let requestClone: Request
  try {
    // Clone the request before reading its body
    requestClone = request.clone()
    const body = await request.json() as BreakTimeRequest

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
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
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

    captureError(error, {
      type: 'create-break-time',
      location: 'api/settings/break-times',
      extra: {
        requestBody: await requestClone.text()
      }
    })
    return NextResponse.json(
      { error: 'Failed to create break time' },
      { status: 500 }
    )
  }
} 