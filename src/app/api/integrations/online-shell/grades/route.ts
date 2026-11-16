export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { denyUnlessOnlineShell, resolveIntegrationTeacher } from '@/lib/online-shell/auth'
import {
  ONLINE_SHELL_GRADE_FIELDS,
  type OnlineShellGradeEntry,
  type OnlineShellGradeField,
  writeOnlineShellGrades,
} from '@/lib/online-shell/grades'

const MAX_ENTRIES = 500

/**
 * POST (Online-Shell, shared secret): write marks into the teacher's Noten grid.
 *
 * Body: {
 *   teacher: { oid?, email? },
 *   classExternalId: string,          // Entra group id of the real class
 *   field: 'praktischeArbeit1' | …,   // the NotenEntry column
 *   overwrite?: boolean,              // replace a different existing mark
 *   entries: [{ studentOid, date: 'YYYY-MM-DD', period: 'AM' | 'PM', grade }]
 * }
 *
 * The teacher must teach the class; each entry's half-day must be one of their
 * teaching days for the student's group. Returns one result per entry.
 */
export async function POST(request: Request) {
  const denied = denyUnlessOnlineShell(request)
  if (denied) return denied

  try {
    if (!(await isFeatureEnabled('noten'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }
    const body = (await request.json().catch(() => null)) as {
      teacher?: { oid?: string; email?: string }
      classExternalId?: unknown
      field?: unknown
      overwrite?: unknown
      entries?: unknown
    } | null

    const field = body?.field as OnlineShellGradeField
    if (
      typeof body?.classExternalId !== 'string' ||
      !ONLINE_SHELL_GRADE_FIELDS.includes(field) ||
      !Array.isArray(body.entries) ||
      body.entries.length > MAX_ENTRIES
    ) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const entries = (body.entries as Array<Record<string, unknown>>)
      .filter(e => e && typeof e.studentOid === 'string')
      .map(e => ({
        studentOid: String(e.studentOid),
        date: typeof e.date === 'string' ? e.date : '',
        period: e.period as OnlineShellGradeEntry['period'],
        grade: Number(e.grade),
      }))

    const teacher = await resolveIntegrationTeacher(body.teacher)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }
    const cls = await prisma.class.findUnique({
      where: { externalId: body.classExternalId },
      select: { id: true, isCombined: true, isActive: true },
    })
    if (!cls || cls.isCombined || !cls.isActive) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const results = await writeOnlineShellGrades({
      teacherId: teacher.id,
      classId: cls.id,
      field,
      overwrite: body.overwrite === true,
      entries,
    })
    return NextResponse.json({ results })
  } catch (error) {
    captureError(error, { location: 'api/integrations/online-shell/grades', type: 'write' })
    return NextResponse.json({ error: 'Failed to write grades' }, { status: 500 })
  }
}
