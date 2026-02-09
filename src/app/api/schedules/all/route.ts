import { NextResponse } from 'next/server'
import { captureError } from '~/lib/sentry'
import { prisma } from '@/lib/prisma'


/**
 * Handles GET requests to retrieve all schedule records from the database.
 * Optional query param schoolYearId: return only schedules for that year.
 *
 * @returns A JSON response containing all schedules, or a 500 error response if retrieval fails.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const schoolYearIdParam = searchParams.get('schoolYearId')
    const schoolYearId = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
    const where =
      schoolYearId != null && !Number.isNaN(schoolYearId) ? { schoolYearId } : undefined
    const schedules = await prisma.schedule.findMany({ where })
    return NextResponse.json(schedules)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/all',
      type: 'fetch-schedules'
    })
    return new NextResponse('Failed to fetch schedules', { status: 500 })
  }
}

