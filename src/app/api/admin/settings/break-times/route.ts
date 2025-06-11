import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const breakTimeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  startTime: z.string().datetime('Start time must be a valid datetime'),
  endTime: z.string().datetime('End time must be a valid datetime'),
  period: z.string().refine(
    (val) => {
      const num = parseInt(val)
      return !isNaN(num) && num > 0
    },
    'Period must be a positive integer'
  )
}).refine(
  (data) => new Date(data.startTime) < new Date(data.endTime),
  {
    message: 'Start time must be before end time',
    path: ['startTime']
  }
)

/**
 * Retrieves all break time records, ordered by start time.
 *
 * @returns A JSON response containing an array of break time records.
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
    console.error('Error fetching break times:', error)
    return NextResponse.json(
      { error: 'Failed to fetch break times' },
      { status: 500 }
    )
  }
}

/**
 * Handles POST requests to create a new break time record.
 *
 * Validates the incoming request body against the break time schema. If validation fails, responds with a 400 status and error details. On success, creates a new break time entry in the database and returns it as JSON.
 *
 * @returns The created break time record as JSON, or a validation error with status 400, or a server error with status 500.
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
    console.error('Error creating break time:', error)
    return NextResponse.json(
      { error: 'Failed to create break time' },
      { status: 500 }
    )
  }
} 