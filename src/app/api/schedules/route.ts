import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ScheduleInput {
  class: string
  weekDay: number
  period: number
  subject: string
  room: string
  teacher: number
}

// GET /api/schedules - Get all schedules for a class
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const className = searchParams.get('class')

    if (!className) {
        return NextResponse.json(
            { error: 'Class parameter is required' },
            { status: 400 }
        )
    }

    try {
        const schedules = await prisma.schedule.findMany({
            where: {
                class: className,
            },
            orderBy: [
                { weekDay: 'asc' },
                { period: 'asc' },
            ],
        })

        return NextResponse.json(schedules)
    } catch (error) {
        console.error('Error fetching schedules:', error)
        return NextResponse.json(
            { error: 'Failed to fetch schedules' },
            { status: 500 }
        )
    }
}

// POST /api/schedules - Create a new schedule entry
export async function POST(request: Request) {
    try {
        const body = await request.json() as ScheduleInput
        const { class: className, weekDay, period, subject, room, teacher } = body

        // Validate required fields
        if (!className || !weekDay || !period || !subject || !room || !teacher) {
            return NextResponse.json(
                { error: 'All fields are required' },
                { status: 400 }
            )
        }

        // Validate weekDay (1-5 for Monday-Friday)
        if (weekDay < 1 || weekDay > 5) {
            return NextResponse.json(
                { error: 'Weekday must be between 1 and 5' },
                { status: 400 }
            )
        }

        const schedule = await prisma.schedule.create({
            data: {
                class: className,
                weekDay,
                period,
                subject,
                room,
                teacher: {
                    connect: {
                        id: teacher
                    }
                }
            },
        })

        return NextResponse.json(schedule, { status: 201 })
    } catch (error) {
        console.error('Error creating schedule:', error)
        return NextResponse.json(
            { error: 'Failed to create schedule' },
            { status: 500 }
        )
    }
} 