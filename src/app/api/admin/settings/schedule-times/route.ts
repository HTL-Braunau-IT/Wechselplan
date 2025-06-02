import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'


export async function GET() {
  try {
    const scheduleTimes = await prisma.scheduleTime.findMany({
      orderBy: {
        startTime: 'asc'
      }
    })
    return NextResponse.json(scheduleTimes)
  } catch (error) {
    console.error('Error fetching schedule times:', error)
    return NextResponse.json(
      { error: 'Failed to fetch schedule times' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    // Validate required fields
    if (!data.startTime || !data.endTime || data.hours == null || !data.period) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create new schedule time
    const scheduleTime = await prisma.scheduleTime.create({
      data: {
        startTime: data.startTime,
        endTime: data.endTime,
        hours: data.hours,
        period: data.period
      }
    })

    return NextResponse.json(scheduleTime)
  } catch (error) {
    console.error('Error creating schedule time:', error)
    return NextResponse.json(
      { error: 'Failed to create schedule time' },
      { status: 500 }
    )
  }
} 