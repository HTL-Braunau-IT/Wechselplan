import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { ok, serverError } from '@/lib/api-response'

/**
 * GET /api/school-years
 * Returns list of school years (id, label, startDate, endDate, semesterChangeDate).
 * Used by header dropdown and by semester/notensammler logic.
 */
export async function GET() {
  try {
    const schoolYears = await prisma.schoolYear.findMany({
      select: {
        id: true,
        label: true,
        startDate: true,
        endDate: true,
        semesterChangeDate: true,
      },
      orderBy: { startDate: 'asc' },
    })

    return ok(schoolYears)
  } catch (error) {
    console.error('Error fetching school years:', error)
    captureError(error, {
      location: 'api/school-years',
      type: 'fetch-school-years',
    })
    return serverError('Failed to fetch school years')
  }
}
