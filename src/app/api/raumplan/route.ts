import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { getInvariantViolations, getWeekOccupancy } from '@/lib/raumplan/query'

/**
 * GET /api/raumplan — room-occupancy grid for a week.
 *
 * Query params:
 *   - `week`  (optional, "dd.MM.yy"): any date in the target week; defaults to today.
 *   - `schoolYearId` (optional): defaults to the current/latest school year.
 *   - `check=invariant` (optional): return the (teacher, weekday, period) → room
 *     invariant violations instead of the grid (diagnostics).
 *
 * Returns the full Mon–Fr × AM/PM occupancy for every room; the Grundriss and
 * Matrix views are derived client-side by filtering the cells.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    if (searchParams.get('check') === 'invariant') {
      const violations = await getInvariantViolations(schoolYearId)
      return NextResponse.json({ schoolYearId, violations })
    }

    const occupancy = await getWeekOccupancy(searchParams.get('week'), schoolYearId)
    return NextResponse.json(occupancy)
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      location: 'api/raumplan',
      type: 'week-occupancy',
    })
    return NextResponse.json({ error: 'Failed to resolve room occupancy' }, { status: 500 })
  }
}
