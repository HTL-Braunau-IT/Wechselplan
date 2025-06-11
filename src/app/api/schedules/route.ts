import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Handles creation of a new schedule for a class on a specific weekday, replacing any existing schedules for that class and weekday.
 *
 * Parses schedule details from the request body, deletes existing schedules matching the provided `classId` and `selectedWeekday`, and creates a new schedule record with the supplied data, including optional `additionalInfo`.
 *
 * @returns A JSON response containing the newly created schedule.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, description, startDate, endDate, selectedWeekday, schedule, classId, additionalInfo } = body

    // Delete existing schedules with the same weekday for this class
    await db.schedule.deleteMany({
      where: {
        classId: classId ? parseInt(classId as string) : null,
        selectedWeekday
      }
    })

    // Create the new schedule
    const newSchedule = await db.schedule.create({
      data: {
        name,
        description,
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        selectedWeekday,
        classId: classId ? parseInt(classId as string) : null,
        // Store the schedule data as JSON
        scheduleData: schedule,
        additionalInfo: additionalInfo
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