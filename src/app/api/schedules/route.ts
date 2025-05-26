import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, description, startDate, endDate, selectedWeekday, schedule, classId } = body

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
        scheduleData: schedule
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

    const schedules = await db.schedule.findMany({
      where: {
        classId: classId ? parseInt(classId) : null
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