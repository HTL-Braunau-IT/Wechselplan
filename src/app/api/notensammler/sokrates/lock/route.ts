import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { denyUnlessAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { isFeatureEnabled } from '@/lib/entitlements'
import { prisma } from '@/lib/prisma'
import { canManageSokrates } from '@/lib/sokrates-lock'
import { parseId, parseSemester, resolveCurrentTeacher, resolveSchoolYearId } from '../_shared'
import { notifySokratesLock } from '../_notify'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * POST /api/notensammler/sokrates/lock
 * Body: { classId, semester, schoolYearId?, scope: 'all' | 'teacher', teacherId?, locked }
 *
 * Hybrid escalation: turn a soft mark into a hard lock. `scope: 'all'` locks the
 * whole class; `scope: 'teacher'` locks a single teacher/subject column. The
 * class+semester must already be marked as entered into Sokrates. Only the class
 * lead or an admin may do this.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const body = (await request.json()) as {
      classId?: unknown
      semester?: unknown
      schoolYearId?: unknown
      scope?: unknown
      teacherId?: unknown
      locked?: unknown
    }
    const classId = parseId(body.classId)
    const semester = parseSemester(body.semester)
    const scope = body.scope === 'all' || body.scope === 'teacher' ? body.scope : null
    const locked = body.locked === true
    if (classId == null || semester == null || scope == null) {
      return NextResponse.json(
        { error: 'classId, semester and scope (all|teacher) are required' },
        { status: 400 },
      )
    }
    const teacherId = scope === 'teacher' ? parseId(body.teacherId) : null
    if (scope === 'teacher' && teacherId == null) {
      return NextResponse.json(
        { error: 'teacherId is required for scope=teacher' },
        { status: 400 },
      )
    }
    const schoolYearId = await resolveSchoolYearId(body.schoolYearId)
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const teacher = await resolveCurrentTeacher(session)
    const canManage = await canManageSokrates({
      classId,
      role: session?.user?.role,
      teacherId: teacher?.id ?? null,
    })
    if (!canManage) {
      return NextResponse.json(
        { error: 'Nur der Klassenleiter oder ein Administrator darf sperren.' },
        { status: 403 },
      )
    }

    const transfer = await prisma.sokratesTransfer.findUnique({
      where: { classId_semester_schoolYearId: { classId, semester, schoolYearId } },
      select: { id: true },
    })
    if (!transfer) {
      return NextResponse.json(
        { error: 'Bitte zuerst als in Sokrates eingetragen markieren.' },
        { status: 400 },
      )
    }

    if (scope === 'all') {
      await prisma.sokratesTransfer.update({
        where: { id: transfer.id },
        data: { lockedAll: locked },
      })
    } else if (locked) {
      await prisma.sokratesSubjectLock.upsert({
        where: { transferId_teacherId: { transferId: transfer.id, teacherId: teacherId! } },
        update: {},
        create: { transferId: transfer.id, teacherId: teacherId! },
      })
    } else {
      await prisma.sokratesSubjectLock.deleteMany({
        where: { transferId: transfer.id, teacherId: teacherId! },
      })
    }

    // A lock takes the sheet away from the people who fill it in, so tell them.
    await notifySokratesLock({
      classId,
      schoolYearId,
      semester,
      actor: teacher,
      session,
      locked,
      scope,
      teacherId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error as Error, { location: 'api/notensammler/sokrates/lock', type: 'lock' })
    return NextResponse.json({ error: 'Failed to update Sokrates lock' }, { status: 500 })
  }
}
