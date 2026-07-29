import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { denyUnlessAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { isFeatureEnabled } from '@/lib/entitlements'
import { prisma } from '@/lib/prisma'
import { canManageSokrates } from '@/lib/sokrates-lock'
import { parseId, parseSemester, resolveCurrentTeacher, resolveSchoolYearId } from '../_shared'
import { notifySokratesMarked } from '../_notify'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * POST /api/notensammler/sokrates/mark
 * Body: { classId, semester, schoolYearId? }
 *
 * The class lead records that this class+semester has been entered into
 * Sokrates, which hard-locks every teacher's column and the Zeugnisnoten in one
 * go: the numbers now live in Sokrates, so nobody but the lead may move them.
 * The lead can lift the blanket lock afterwards via `sokrates/lock` to fall back
 * to the soft, notify-only mode.
 *
 * Re-marking an already-marked semester refreshes `markedAt`, re-applies the
 * lock and clears outstanding change notices — the class lead has re-synced, so
 * the drift is resolved. Only the class lead or an admin may do this.
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
    }
    const classId = parseId(body.classId)
    const semester = parseSemester(body.semester)
    if (classId == null || semester == null) {
      return NextResponse.json({ error: 'classId and semester are required' }, { status: 400 })
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
        { error: 'Nur der Klassenleiter oder ein Administrator darf dies markieren.' },
        { status: 403 },
      )
    }

    const markedById = teacher?.id ?? 0
    const markedByName = teacher?.name ?? session?.user?.name ?? 'Administrator'
    const now = new Date()

    // Mark (or refresh the mark) and, since re-marking means the class lead has
    // re-entered Sokrates, resolve any changes recorded before this moment —
    // atomically, so a notice can never be left dangling against a stale mark.
    //
    // `lockedAll` is set here rather than left to a second click: marking means
    // the grades are in Sokrates, and from that moment every teacher is blocked.
    const transfer = await prisma.$transaction(async tx => {
      const t = await tx.sokratesTransfer.upsert({
        where: {
          classId_semester_schoolYearId: { classId, semester, schoolYearId },
        },
        update: { markedById, markedByName, markedAt: now, lockedAll: true },
        create: {
          classId,
          semester,
          schoolYearId,
          markedById,
          markedByName,
          markedAt: now,
          lockedAll: true,
        },
      })
      await tx.sokratesChangeNotice.updateMany({
        where: { transferId: t.id, acknowledgedAt: null },
        data: { acknowledgedAt: now },
      })
      return t
    })

    await notifySokratesMarked({
      classId,
      schoolYearId,
      semester,
      actor: teacher,
      session,
      readAt: now,
    })

    return NextResponse.json({ success: true, transferId: transfer.id })
  } catch (error) {
    captureError(error as Error, { location: 'api/notensammler/sokrates/mark', type: 'mark' })
    return NextResponse.json({ error: 'Failed to mark Sokrates transfer' }, { status: 500 })
  }
}
