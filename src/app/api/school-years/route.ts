import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * GET /api/school-years
 * Returns list of school years (id, label, startDate, endDate, semesterChangeDate, isCurrent).
 * Used by header dropdown and by semester/notensammler logic.
 */
export async function GET() {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

  try {
    const schoolYears = await prisma.schoolYear.findMany({
      select: {
        id: true,
        label: true,
        startDate: true,
        endDate: true,
        semesterChangeDate: true,
        isCurrent: true,
      },
      orderBy: { startDate: 'asc' },
    })

    return NextResponse.json(schoolYears)
  } catch (error) {
    console.error('Error fetching school years:', error)
    captureError(error, {
      location: 'api/school-years',
      type: 'fetch-school-years',
    })
    return NextResponse.json({ error: 'Failed to fetch school years' }, { status: 500 })
  }
}
