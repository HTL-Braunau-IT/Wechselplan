import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { badRequest, created, ok, serverError } from '@/lib/api-response'

/**
 * Retrieves all schedule time records from the database, ordered by start time.
 *
 * @returns A JSON response containing the list of schedule times, or an error message with status 500 if retrieval fails.
 */
export async function GET() {
  try {
    const scheduleTimes = await prisma.scheduleTime.findMany({
      orderBy: {
        startTime: 'asc'
      }
    })
    return ok(scheduleTimes)
  } catch (error) {
    
    captureError(error, {
      location: 'api/settings/schedule-times',
      type: 'fetch-schedule-times'
    })
    return serverError('Failed to fetch schedule times')
  }
}

/**
 * Handles POST requests to create a new schedule time entry.
 *
 * Validates the request body for required fields and correct formats, then creates a new schedule time record in the database. Returns the created schedule time as a JSON response. If validation fails, responds with a 400 status and an error message. On processing or database errors, logs the error and responds with a 500 status.
 *
 * @returns A JSON response containing the created schedule time, or an error message with the appropriate HTTP status code.
 */
export async function POST(request: Request) {
  let requestBody: Record<string, unknown> = {}

  try {
    const body = await request.json() as Record<string, unknown>
    requestBody = body
    const { startTime, endTime, period, hours: rawHours } = body
    const hours = Number(rawHours)

    // Validate hours
    if (!Number.isFinite(hours) || hours <= 0) {
      return badRequest('Hours must be a positive number')
    }

    // Validate period
    if (period !== 'AM' && period !== 'PM') {
      return badRequest('Invalid period. Must be AM or PM')
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(startTime as string) || !timeRegex.test(endTime as string)) {
      return badRequest('Invalid time format. Use HH:mm')
    }

    const scheduleTime = await prisma.scheduleTime.create({
      data: {
        startTime: startTime as string,
        endTime: endTime as string,
        hours,
        period
      }
    })

    return created(scheduleTime)
  } catch (error) {
    
    captureError(error, {
      location: 'api/settings/schedule-times',
      type: 'create-schedule-time',
      extra: {
        requestBody
      }
    })
    return serverError('Failed to create schedule time')
  }
} 