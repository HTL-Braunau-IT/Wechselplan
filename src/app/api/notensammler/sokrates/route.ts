import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { denyUnlessAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { isFeatureEnabled } from '@/lib/entitlements'
import { prisma } from '@/lib/prisma'
import { canManageSokrates, getSokratesStatus } from '@/lib/sokrates-lock'
import { parseId, resolveCurrentTeacher, resolveSchoolYearId } from './_shared'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/notensammler/sokrates?classId=&schoolYearId=
 *
 * Returns the per-semester Sokrates mark/lock state for a class, plus whether
 * the current user may manage it (class lead or admin). Any staff member may
 * read this — the grid needs it to disable locked cells for everyone.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const classId = parseId(searchParams.get('classId'))
    if (classId == null) {
      return NextResponse.json({ error: 'classId is required' }, { status: 400 })
    }
    const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const teacher = await resolveCurrentTeacher(session)
    const status = await getSokratesStatus(classId, schoolYearId)
    // `canManage` is now the class lead alone. An admin who is not the lead gets
    // `canManage: false` and instead sees `isAdmin`, which the grid uses to offer
    // the deliberate one-time override button.
    const canManage = await canManageSokrates({
      classId,
      role: session?.user?.role,
      teacherId: teacher?.id ?? null,
    })
    const isAdmin = session?.user?.role === 'admin'

    // Cells changed after the mark and not yet resolved — the grid flags these.
    const openNotices = await prisma.sokratesChangeNotice.findMany({
      where: { classId, schoolYearId, acknowledgedAt: null },
      select: { studentId: true, teacherId: true, semester: true },
    })
    const driftedCells = [
      ...new Set(openNotices.map(n => `${n.studentId}:${n.teacherId}:${n.semester}`)),
    ]

    return NextResponse.json({ status, canManage, isAdmin, driftedCells })
  } catch (error) {
    captureError(error as Error, { location: 'api/notensammler/sokrates', type: 'get-status' })
    return NextResponse.json({ error: 'Failed to load Sokrates status' }, { status: 500 })
  }
}
