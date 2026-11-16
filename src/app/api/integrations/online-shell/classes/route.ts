export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { denyUnlessOnlineShell, resolveIntegrationTeacher } from '@/lib/online-shell/auth'
import { teacherClassesForOnlineShell } from '@/lib/online-shell/classes'
import { resolveSchoolYearId } from '@/lib/school-year'

/**
 * POST (Online-Shell, shared secret): the classes a teacher teaches this school
 * year, with per-weekday groups, their students and the teacher's teaching days.
 *
 * Body: { teacher: { oid?, email? } }. POST rather than GET so the teacher's
 * e-mail never ends up in a URL / access log.
 */
export async function POST(request: Request) {
  const denied = denyUnlessOnlineShell(request)
  if (denied) return denied

  try {
    const body = (await request.json().catch(() => null)) as {
      teacher?: { oid?: string; email?: string }
    } | null
    const teacher = await resolveIntegrationTeacher(body?.teacher)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }
    const schoolYearId = await resolveSchoolYearId()
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }
    const schoolYear = await prisma.schoolYear.findUnique({
      where: { id: schoolYearId },
      select: { id: true, label: true },
    })
    const classes = await teacherClassesForOnlineShell({ teacherId: teacher.id, schoolYearId })
    return NextResponse.json({
      teacher: { id: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName },
      schoolYear,
      classes,
    })
  } catch (error) {
    captureError(error, { location: 'api/integrations/online-shell/classes', type: 'fetch' })
    return NextResponse.json({ error: 'Failed to load classes' }, { status: 500 })
  }
}
