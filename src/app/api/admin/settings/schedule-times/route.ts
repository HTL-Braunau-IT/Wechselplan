import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'


/**
 * Retrieves all schedule time records from the database, ordered by ascending start time.
 *
 * @returns A JSON response containing the list of schedule times, or an error message with HTTP status 500 if retrieval fails.
 */
export async function GET() {
  try {
    const scheduleTimes = await prisma.scheduleTime.findMany({
      orderBy: {
        startTime: 'asc'
      }
    })
    return NextResponse.json(scheduleTimes)
  } catch (error) {
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

/**
 * Handles HTTP POST requests to create a new schedule time record.
 *
 * Validates the request body for required fields and correct formats, then creates a schedule time entry in the database. Returns the created record as JSON, or an error response with status 400 for validation failures and 500 for server errors.
 *
 * @param request - The incoming HTTP request containing schedule time data in JSON format.
 * @returns A JSON response with the created schedule time record, or an error message with an appropriate HTTP status code.
 */
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

    // Validate hours
    const hours = Number(data.hours)
    if (!Number.isFinite(hours) || hours <= 0) {
      return NextResponse.json(
        { error: 'Hours must be a positive number' },
        { status: 400 }
      )
    }

    // Validate period
    if (data.period !== 'AM' && data.period !== 'PM') {
      return NextResponse.json(
        { error: 'Invalid period. Must be AM or PM' },
        { status: 400 }
      )
    }

    // Validate time format
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(data.startTime as string) || !timeRegex.test(data.endTime as string)) {
      return NextResponse.json(
        { error: 'Invalid time format. Use HH:mm' },
        { status: 400 }
      )
    }

    // Create new schedule time
    const scheduleTime = await prisma.scheduleTime.create({
      data: {
        startTime: data.startTime,
        endTime: data.endTime,
        hours,
        period: data.period
      }
    })

    return NextResponse.json(scheduleTime)
  } catch (error) {
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