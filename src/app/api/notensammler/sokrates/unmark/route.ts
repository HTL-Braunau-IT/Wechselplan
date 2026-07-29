import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { denyUnlessAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { isFeatureEnabled } from '@/lib/entitlements'
import { prisma } from '@/lib/prisma'
import { canManageSokrates } from '@/lib/sokrates-lock'
import {
  clearSokratesChangeNotifications,
  gradeColumnTeachers,
  notensammlerLink,
  notifyQuietly,
} from '@/lib/notifications'
import { parseId, parseSemester, resolveCurrentTeacher, resolveSchoolYearId } from '../_shared'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * POST /api/notensammler/sokrates/unmark
 * Body: { classId, semester, schoolYearId? }
 *
 * Removes the Sokrates mark (and, by cascade, its locks and change notices) for
 * a class+semester. Only the class lead or an admin may do this.
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
        { error: 'Nur der Klassenleiter oder ein Administrator darf dies aufheben.' },
        { status: 403 },
      )
    }

    // Recipients are read before the delete: cascading the transfer away takes
    // its locks with it, and the teachers being released are the ones to tell.
    const [columnTeachers, classRecord] = await Promise.all([
      gradeColumnTeachers(classId, schoolYearId),
      prisma.class.findUnique({ where: { id: classId }, select: { name: true } }),
    ])

    await prisma.sokratesTransfer.deleteMany({ where: { classId, semester, schoolYearId } })

    // The mark's own notifications describe a state that no longer exists.
    await clearSokratesChangeNotifications({
      classId,
      schoolYearId,
      semester,
      readAt: new Date(),
    })

    if (classRecord) {
      await notifyQuietly({
        type: 'sokrates-unmarked',
        recipientIds: columnTeachers,
        actorId: teacher?.id ?? null,
        actorName: teacher?.name ?? session?.user?.name ?? 'Administrator',
        params: { className: classRecord.name, semester },
        link: notensammlerLink(classRecord.name),
        dedupeKey: `sokrates-unmarked:${classId}:${schoolYearId}:${semester}`,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error as Error, { location: 'api/notensammler/sokrates/unmark', type: 'unmark' })
    return NextResponse.json({ error: 'Failed to unmark Sokrates transfer' }, { status: 500 })
  }
}
