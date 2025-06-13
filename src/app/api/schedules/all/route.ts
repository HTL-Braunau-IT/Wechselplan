import { NextResponse } from 'next/server'
import { captureError } from '~/lib/sentry'
import { prisma } from '@/lib/prisma'


export async function GET() {
  try {
    const schedules = await prisma.schedule.findMany()
    return NextResponse.json(schedules)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/all',
      type: 'fetch-schedules'
    })
    return new NextResponse('Failed to fetch schedules', { status: 500 })
  }
}

