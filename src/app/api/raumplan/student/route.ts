import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { getStudentPlacement } from '@/lib/raumplan/query'

/**
 * GET /api/raumplan/student — "where should I be?" for one student on a date.
 *
 * Query params:
 *   - `studentId` (required, int).
 *   - `date` (optional, "dd.MM.yy"): defaults to today.
 *   - `schoolYearId` (optional): defaults to the current/latest school year.
 *
 * Staff-tier for now: the Schüler-Ansicht is a staff picker (HANDOFF §8.3). A
 * student-facing self-view would need a student→session identity mapping (open
 * question) plus a `session`-tier rule with an ownership check — see
 * docs/API/raumplan/README.md.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)

    const studentIdParam = searchParams.get('studentId')
    if (!studentIdParam) {
      return NextResponse.json({ error: 'studentId parameter is required' }, { status: 400 })
    }
    const studentId = parseInt(studentIdParam, 10)
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'studentId must be a number' }, { status: 400 })
    }

    const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const result = await getStudentPlacement(studentId, searchParams.get('date'), schoolYearId)
    if (!result) {
      return NextResponse.json({ error: 'Student not found or has no class' }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      location: 'api/raumplan/student',
      type: 'student-placement',
    })
    return NextResponse.json({ error: 'Failed to resolve student placement' }, { status: 500 })
  }
}
