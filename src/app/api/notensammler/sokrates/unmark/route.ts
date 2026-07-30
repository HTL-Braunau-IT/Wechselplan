import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { denyUnlessAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { isFeatureEnabled } from '@/lib/entitlements'
import { prisma } from '@/lib/prisma'
import { canManageSokrates } from '@/lib/sokrates-lock'
import { parseId, parseSemester, resolveCurrentTeacher, resolveSchoolYearId } from '../_shared'
import { notifySokratesUnmarked } from '../_notify'

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
      adminOverride?: unknown
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
      adminOverride: body.adminOverride === true,
    })
    if (!canManage) {
      return NextResponse.json(
        { error: 'Nur der Klassenleiter oder ein Administrator darf dies aufheben.' },
        { status: 403 },
      )
    }

    await prisma.sokratesTransfer.deleteMany({ where: { classId, semester, schoolYearId } })

    // Recipients are still resolvable afterwards: the cascade takes the locks
    // and change notices with the transfer, but not the grades they were about.
    await notifySokratesUnmarked({ classId, schoolYearId, semester, actor: teacher, session })

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error as Error, { location: 'api/notensammler/sokrates/unmark', type: 'unmark' })
    return NextResponse.json({ error: 'Failed to unmark Sokrates transfer' }, { status: 500 })
  }
}
