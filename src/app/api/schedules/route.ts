import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const scheduleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid start date format'
  }),
  endDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid end date format'
  }),
  selectedWeekday: z.number().int().min(0).max(6),
  scheduleData: z.any(), // Using any for now since the exact structure isn't clear
  classId: z.string().optional(),
  additionalInfo: z.any().optional()
})

/**
 * Creates or replaces a schedule for a class on a specific weekday.
 *
 * Validates the request body, deletes any existing schedules for the given class and weekday, and creates a new schedule record with the provided details.
 *
 * @returns A JSON response containing the newly created schedule, or an error response if validation fails.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // Validate the request body against the schema
    const validationResult = scheduleSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validationResult.error.format() },
        { status: 400 }
      )
    }

    const { name, description, startDate, endDate, selectedWeekday, scheduleData, classId, additionalInfo } = validationResult.data

    // Delete existing schedules with the same weekday for this class
    await db.schedule.deleteMany({
      where: {
        classId: classId ? parseInt(classId) : null,
        selectedWeekday
      }
    })

    // Create the new schedule
    const newSchedule = await db.schedule.create({
      data: {
        name,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        selectedWeekday,
        classId: classId ? parseInt(classId) : null,
        scheduleData,
        additionalInfo
      }
    })

    return NextResponse.json(newSchedule)
  } catch (error) {
    console.error('[SCHEDULES_POST]', error)
    return new NextResponse('Internal Error', { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const classId = searchParams.get('classId')
    const weekday = searchParams.get('weekday')

    const schedules = await db.schedule.findMany({
      where: {
        classId: classId ? parseInt(classId) : undefined,
        selectedWeekday: weekday ? parseInt(weekday) : undefined
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(schedules)
  } catch (error) {
    console.error('[SCHEDULES_GET]', error)
    return new NextResponse('Internal Error', { status: 500 })
  }
} 