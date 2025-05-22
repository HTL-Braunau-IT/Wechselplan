import { NextResponse } from 'next/server'
import { db } from '@/server/db'
import { SchoolHoliday } from '@prisma/client'

export async function POST(request: Request) {
  try {
    const holidays = await request.json() as Array<{
      name: string
      startDate: string
      endDate: string
    }>

    if (!Array.isArray(holidays) || holidays.length === 0) {
      return NextResponse.json(
        { error: 'Invalid holidays data' },
        { status: 400 }
      )
    }

    // Create all holidays in a transaction
    const createdHolidays = await db.$transaction(
      holidays.map(holiday =>
        db.schoolHoliday.create({
          data: {
            name: holiday.name,
            startDate: new Date(holiday.startDate),
            endDate: new Date(holiday.endDate)
          }
        })
      )
    )

    return NextResponse.json(createdHolidays)
  } catch (error) {
    console.error('Error saving holidays:', error)
    return NextResponse.json(
      { error: 'Failed to save holidays' },
      { status: 500 }
    )
  }
} 