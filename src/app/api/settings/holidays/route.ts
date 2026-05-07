import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { badRequest, created, ok, serverError } from '@/lib/api-response'

/**
 * Handles GET requests to retrieve all school holiday records, ordered by start date.
 *
 * @returns A JSON response with an array of school holiday objects, or an error message with HTTP status 500 if retrieval fails.
 */
export async function GET() {
  try {
    const holidays = await prisma.schoolHoliday.findMany({
      orderBy: {
        startDate: 'asc'
      }
    })
    return ok(holidays)
  } catch (error) {

    captureError(error, {
      type: 'fetch-holidays',
      location: 'api/settings/holidays'
    })
    return serverError('Failed to fetch holidays')
  }
}

interface HolidayRequest {
  name: string;
  startDate: string;
  endDate: string;
}

/**
 * Handles HTTP POST requests to create a new school holiday record.
 *
 * Validates the request body for required fields and correct date formats, ensuring the end date is not before the start date. Returns the created holiday object as JSON on success, or an error message with an appropriate HTTP status code on failure.
 *
 * @returns A JSON response containing the created holiday object, or an error message with HTTP status 400 or 500.
 */
export async function POST(request: Request) {
  let requestBody: HolidayRequest | Record<string, unknown> = {}
  try {
    const body = await request.json() as HolidayRequest;
    requestBody = body

    const { name, startDate, endDate } = body;

    if (!name || !startDate || !endDate) {
      return badRequest('Missing required fields')
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return badRequest('Invalid date format')
    }

    // Validate date order
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      return badRequest('End date must be after start date')
    }

    const holiday = await prisma.schoolHoliday.create({
      data: {
        name,
        startDate: start,
        endDate: end,
      }
    })
    
    return created(holiday)
  } catch (error) {

    captureError(error, {
      type: 'create-holiday',
      location: 'api/settings/holidays',
      extra: {
        requestBody
      }
    })
    return serverError('Failed to create holiday')
  }
} 