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