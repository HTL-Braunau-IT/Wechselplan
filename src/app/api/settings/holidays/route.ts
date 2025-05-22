import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET() {
  try {
    const holidays = await prisma.schoolHoliday.findMany({
      orderBy: {
        startDate: 'asc'
      }
    })
    return NextResponse.json(holidays)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('Prisma error fetching holidays:', error.message)
    } else if (error instanceof Error) {
      console.error('Error fetching holidays:', error.message)
    } else {
      console.error('Unknown error fetching holidays:', error)
    }
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
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      }
    })
    
    return NextResponse.json(holiday)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('Prisma error adding holiday:', error.message)
    } else if (error instanceof Error) {
      console.error('Error adding holiday:', error.message)
    } else {
      console.error('Unknown error adding holiday:', error)
    }
    return NextResponse.json(
      { error: 'Failed to add holiday' },
      { status: 500 }
    )
  }
} 