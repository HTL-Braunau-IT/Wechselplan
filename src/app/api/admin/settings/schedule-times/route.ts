import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'


/**
 * Handles GET requests to retrieve all schedule time records, ordered by start time.
 *
 * @returns A JSON response containing the list of schedule times or an error message with a 500 status code if retrieval fails.
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
    console.error('Error fetching schedule times:', error)
    return NextResponse.json(
      { error: 'Failed to fetch schedule times' },
      { status: 500 }
    )
  }
}

/**
 * Handles HTTP POST requests to create a new schedule time record.
 *
 * Parses and validates the request body for required fields (`startTime`, `endTime`, `hours`, and `period`). Ensures that `hours` is a positive number before creating the schedule time in the database. Returns the created schedule time as a JSON response, or an error message with an appropriate status code if validation fails or an error occurs during creation.
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
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
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