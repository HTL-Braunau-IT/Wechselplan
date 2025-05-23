import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, description, startDate, endDate, selectedWeekday, schedule, classId } = body

    // First create the schedule
    const newSchedule = await db.schedule.create({
      data: {
        name,
        description,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        selectedWeekday,
        classId: classId ? parseInt(classId) : null,
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