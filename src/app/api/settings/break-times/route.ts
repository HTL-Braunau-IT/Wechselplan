import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { badRequest, created, ok, serverError } from '@/lib/api-response'

/**
 * Retrieves all break time records from the database, ordered by start time.
 *
 * @returns A JSON response containing an array of break time records, or an error message with status 500 if retrieval fails.
 */
export async function GET() {
  try {
    const breakTimes = await prisma.breakTime.findMany({
      orderBy: {
        startTime: 'asc'
      }
    })
    return ok(breakTimes)
  } catch (error) {

    captureError(error, {
      type: 'fetch-break-times',
      location: 'api/settings/break-times'
    })
    return serverError('Failed to fetch break times')
  }
}

interface BreakTimeRequest {
  name: string
  startTime: string
  endTime: string
  period: 'AM' | 'PM'
}

/**
 * Handles POST requests to create a new break time record.
 *
 * Expects a JSON body with `name`, `startTime`, `endTime`, and `period` fields. Validates required fields, period value, and time format before creating the record.
 *
 * @returns A JSON response containing the created break time record, or an error message with an appropriate HTTP status code if validation fails or an error occurs.
 */
export async function POST(request: Request) {

  try {
    const body = await request.json() as BreakTimeRequest

    const { name, startTime, endTime, period } = body

    // Validate required fields
    if (!name || !startTime || !endTime || !period) {
      return badRequest('Missing required fields')
    }

    // Validate period
    if (period !== 'AM' && period !== 'PM') {
      return badRequest('Invalid period. Must be AM or PM')
    }

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return badRequest('Invalid time format. Use HH:mm')
    }

    const breakTime = await prisma.breakTime.create({
      data: {
        name,
        startTime,
        endTime,
        period
      }
    })

    return created(breakTime)
  } catch (error) {

    captureError(error, {
      type: 'create-break-time',
      location: 'api/settings/break-times',
    })
    return serverError('Failed to create break time')
  }
} 