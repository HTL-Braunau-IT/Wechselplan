import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { captureError } from '~/lib/sentry'

const breakTimeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  startTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Start time must be in HH:mm format'),
  endTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'End time must be in HH:mm format'),
  period: z.enum(['AM', 'PM', 'LUNCH'], {
    errorMap: () => ({ message: 'Period must be AM, PM, or LUNCH' })
  })
}).refine(
  (data) => {
    const [startHour, startMin] = data.startTime.split(':').map(Number)
    const [endHour, endMin] = data.endTime.split(':').map(Number)
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
    return NextResponse.json(breakTimes)
  } catch (error) {
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
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: validationResult.error.format()
        },
        { status: 400 }
      )
    }

    // Create new break time
    const breakTime = await prisma.breakTime.create({
      data: validationResult.data
    })

    return NextResponse.json(breakTime)
  } catch (error) {
    captureError(error, {
      location: 'api/settings/break-times',
      type: 'create-break-time'
    })
    return NextResponse.json(
      { error: 'Failed to create break time' },
      { status: 500 }
    )
  }
} 