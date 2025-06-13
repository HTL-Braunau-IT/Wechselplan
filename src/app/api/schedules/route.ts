import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { captureError } from '~/lib/sentry'
import { prisma } from '@/lib/prisma'

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
 * Handles HTTP POST requests to create or replace a schedule for a class on a specific weekday.
 *
 * Validates the request body, deletes any existing schedules for the specified class and weekday, and creates a new schedule with the provided details.
 *
 * @returns A JSON response containing the newly created schedule, or an error response with details if validation fails.
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

    captureError(error, {
      location: 'api/schedules',
      type: 'create-schedule'
    })
    return new NextResponse('Internal Error', { status: 500 })
  }
}

/**
 * Retrieves schedules for a class, optionally filtered by weekday.
 *
 * Looks up the class by name from the `classId` query parameter, then returns schedules for that class, optionally filtered by the `weekday` query parameter. Results are ordered by creation date descending.
 *
 * @returns A JSON response containing the list of matching schedules, or an error message with appropriate HTTP status if not found or on error.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const className = searchParams.get('classId')
    const weekday = searchParams.get('weekday')

    if (!className) {
      return NextResponse.json({ error: 'Class ID is required' }, { status: 400 })
    }

    const classRecord = await prisma.class.findFirst({
      where: {
        name: className
      }
    })

    if (!classRecord) {
      return NextResponse.json({ error: `Class '${className}' not found` }, { status: 404 })
    }

    const schedules = await db.schedule.findMany({
      where: {
        classId: classRecord.id,
        ...(weekday ? { selectedWeekday: parseInt(weekday) } : {})
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (schedules.length === 0) {
      captureError(new Error('No schedules found for classId ' + classRecord.id), {
        location: 'api/schedules',
        type: 'fetch-schedules'
      })
      return NextResponse.json({ error: 'No schedules found' }, { status: 404 })
    }

    return NextResponse.json(schedules)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules',
      type: 'fetch-schedules'
    })
    return new NextResponse('Internal Error', { status: 500 })
  }
} 