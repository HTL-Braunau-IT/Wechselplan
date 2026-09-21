import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { resolveSessionStudent } from '@/lib/session-student'
import { getStudentSelfPlacement } from '@/lib/raumplan/query'

/**
 * GET /api/raumplan/me — the signed-in student's own room for today, or the next
 * workshop day if today has nothing.
 *
 * `session`-tier and self-scoped: the `Student` is resolved from the session
 * (never a query param), so a student only ever gets their own placement. Staff
 * who are not also students resolve to no student and get 404 — they use the
 * staff `/api/raumplan/student` endpoint instead.
 *
 * Query params: `date` (optional "dd.MM.yy", defaults today), `schoolYearId`.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('session')
  if (!gate.ok) return gate.response

  try {
    const student = await resolveSessionStudent(gate.session)
    if (student?.classId == null) {
      return NextResponse.json({ error: 'No student profile for this session' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const cls = await prisma.class.findUnique({
      where: { id: student.classId },
      select: { name: true },
    })

    const result = await getStudentSelfPlacement(
      {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        classId: student.classId,
        groupId: student.groupId,
        className: cls?.name ?? null,
      },
      searchParams.get('date'),
      schoolYearId,
    )

    return NextResponse.json(result)
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      location: 'api/raumplan/me',
      type: 'student-self-placement',
    })
    return NextResponse.json({ error: 'Failed to resolve room' }, { status: 500 })
  }
}
