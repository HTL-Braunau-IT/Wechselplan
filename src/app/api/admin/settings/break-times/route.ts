import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { captureError } from '~/lib/sentry'
import { created, ok, serverError, unprocessable } from '@/lib/api-response'

const breakTimeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  startTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:mm format'),
  endTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:mm format'),
  period: z.enum(['AM', 'PM', 'LUNCH'], {
    errorMap: () => ({ message: 'Period must be AM, PM, or LUNCH' })
  })
}).refine(
  (data) => {
    const startTimeParts = data.startTime.split(':').map(Number)
    const endTimeParts = data.endTime.split(':').map(Number)
    
    const startHour = startTimeParts[0]!
    const startMin = startTimeParts[1]!
    const endHour = endTimeParts[0]!
    const endMin = endTimeParts[1]!
    
    const startMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin
    return startMinutes < endMinutes
  },
  {
    message: 'Start time must be before end time',
    path: ['startTime']
  }
)

/**
 * Handles GET requests to fetch all break time records, ordered by start time.
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
      location: 'api/settings/break-times',
      type: 'fetch-break-times'
    })
    return serverError('Failed to fetch break times')
  }
}

/**
 * Creates a new break time record from a POST request.
 *
 * Validates the request body against the break time schema and, if valid, stores the new record in the database. Returns the created record as JSON, or an error response with status 400 for validation errors or 500 for server errors.
 */
export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    // Validate data against schema
    const validationResult = breakTimeSchema.safeParse(data)
    if (!validationResult.success) {
      return unprocessable('Validation failed', validationResult.error.format())
    }

    // Create new break time
    const breakTime = await prisma.breakTime.create({
      data: validationResult.data
    })

    return created(breakTime)
  } catch (error) {
    captureError(error, {
      location: 'api/settings/break-times',
      type: 'create-break-time'
    })
    return serverError('Failed to create break time')
  }
} 