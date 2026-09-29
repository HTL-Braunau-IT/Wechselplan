import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { requireAccess } from '@/lib/api-guard'
import { resolveSessionStudent } from '@/lib/session-student'
import { resolveMemberClassIds } from '@/lib/combined-classes'
import { planClassIdsFor } from '@/lib/weekday-groups'

/**
 * GET /api/me/plan-roster?class=<name> — the roster of a plan the signed-in
 * student belongs to, so the student home page can render the full Wechselplan
 * (Gruppenübersicht included) like the staff /schedules view does.
 *
 * `session`-tier but self-scoped: `class` must be the student's own class or a
 * combined class spanning it; anything else is 403. `/api/students` stays staff —
 * it takes any class and returns usernames. Only names and class are returned.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('session')
  if (!gate.ok) return gate.response

  const className = new URL(request.url).searchParams.get('class')
  if (!className) {
    return NextResponse.json({ error: 'Class parameter is required' }, { status: 400 })
  }

  try {
    const student = await resolveSessionStudent(gate.session)
    if (student?.classId == null) {
      return NextResponse.json({ error: 'No student profile for this session' }, { status: 404 })
    }

    const planClass = await prisma.class.findUnique({
      where: { name: className },
      select: { id: true, isCombined: true },
    })
    const allowed = await planClassIdsFor(prisma, student.classId)
    if (!planClass || !allowed.includes(planClass.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const students = await prisma.student.findMany({
      where: { classId: { in: await resolveMemberClassIds(planClass.id) } },
      select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    return NextResponse.json(
      students.map(s => ({
        id: s.id,
        firstName: s.firstName ?? '',
        lastName: s.lastName ?? '',
        class: s.class?.name ?? '',
        ...(planClass.isCombined ? { originalClass: s.class?.name ?? undefined } : {}),
      })),
    )
  } catch (error) {
    captureError(error, { location: 'api/me/plan-roster', type: 'fetch-plan-roster' })
    return NextResponse.json({ error: 'Failed to fetch roster' }, { status: 500 })
  }
}
