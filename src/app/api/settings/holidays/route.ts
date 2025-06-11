import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

export async function GET() {
  try {
    const holidays = await prisma.schoolHoliday.findMany({
      orderBy: {
        startDate: 'asc'
      }
    })
    return NextResponse.json(holidays)
  } catch (error) {
    console.error('Error fetching holidays:', error)
    captureError(error, {
      location: 'api/settings/holidays',
      type: 'fetch-holidays'
    })
    return NextResponse.json(
      { error: 'Failed to fetch holidays' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { name, startDate, endDate } = await request.json()
    
    const holiday = await prisma.schoolHoliday.create({
      data: {
        name,
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      }
    })
    
    return NextResponse.json(holiday)
  } catch (error) {
    console.error('Error creating holiday:', error)
    captureError(error, {
      location: 'api/settings/holidays',
      type: 'create-holiday',
      extra: {
        requestBody: await request.text()
      }
    })
    return NextResponse.json(
      { error: 'Failed to create holiday' },
      { status: 500 }
    )
  }
} 