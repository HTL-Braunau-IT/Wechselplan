import { NextResponse } from 'next/server'
import { captureError } from '~/lib/sentry'
import { prisma } from '@/lib/prisma'


/**
 * Handles GET requests to retrieve all schedule records from the database.
 *
 * @returns A JSON response containing all schedules, or a 500 error response if retrieval fails.
 */
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

