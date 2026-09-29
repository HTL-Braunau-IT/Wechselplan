import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { resolveSessionStudent } from '@/lib/session-student'
import { studentGradingCriteria } from '@/lib/grading-criteria'

/**
 * GET /api/me/grading-criteria — the Beurteilungskriterien of every teacher in
 * the signed-in student's Wechselplan, each resolved to the template that
 * applies to the student's class (see src/lib/grading-criteria.ts).
 *
 * `session`-tier and self-scoped: the student comes from the session, never a
 * param. A session without a student profile gets 404.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('session')
  if (!gate.ok) return gate.response

  try {
    const student = await resolveSessionStudent(gate.session)
    if (!student) {
      return NextResponse.json({ error: 'No student profile for this session' }, { status: 404 })
    }
    const { searchParams } = new URL(request.url)
    const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
    if (schoolYearId == null) return NextResponse.json([])
    return NextResponse.json(await studentGradingCriteria(student, schoolYearId))
  } catch (error) {
    captureError(error, { location: 'api/me/grading-criteria', type: 'student-criteria' })
    return NextResponse.json({ error: 'Kriterien konnten nicht geladen werden' }, { status: 500 })
  }
}
