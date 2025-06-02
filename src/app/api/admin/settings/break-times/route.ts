import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
    
    // Validate required fields
    if (!data.name || !data.startTime || !data.endTime || !data.period) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create new break time
    const breakTime = await prisma.breakTime.create({
      data: {
        name: data.name,
        startTime: data.startTime,
        endTime: data.endTime,
        period: data.period
      }
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