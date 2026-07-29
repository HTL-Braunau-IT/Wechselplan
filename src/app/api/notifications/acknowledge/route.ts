import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { denyUnlessAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { resolveCurrentTeacher } from '@/lib/current-teacher'
import { bestEffort } from '@/lib/notifications'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** Shape of the params a `sokrates-change` notification carries. */
interface SokratesChangeParams {
  classId?: unknown
  schoolYearId?: unknown
  semester?: unknown
}

/**
 * A `sokrates-change` entry is a pointer at open SokratesChangeNotice rows, and
 * the Notensammler grid flags the same rows as drifted cells. Dismissing the
 * bell entry has always meant "I have dealt with this", so it resolves those
 * notices too — otherwise the grid would keep the markers forever.
 *
 * Scoped to the caller: only notices addressed to them are touched.
 */
async function resolveLinkedSokratesNotices(
  rows: Array<{ type: string; params: unknown }>,
  recipientId: number,
  now: Date,
): Promise<void> {
  const scopes = rows
    .filter(row => row.type === 'sokrates-change')
    .map(row => (row.params ?? {}) as SokratesChangeParams)
    .filter(
      (params): params is { classId: number; schoolYearId: number; semester: string } =>
        typeof params.classId === 'number' &&
        typeof params.schoolYearId === 'number' &&
        (params.semester === 'first' || params.semester === 'second'),
    )

  for (const scope of scopes) {
    await prisma.sokratesChangeNotice.updateMany({
      where: {
        classId: scope.classId,
        schoolYearId: scope.schoolYearId,
        semester: scope.semester,
        recipientId,
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: now },
    })
  }
}

/**
 * POST /api/notifications/acknowledge
 * Body: { id } to acknowledge one, or { all: true } to acknowledge all.
 *
 * Only the recipient may acknowledge their own notifications — every update is
 * scoped to the caller's teacher id, so an id belonging to someone else matches
 * nothing.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const teacher = await resolveCurrentTeacher(session)
    if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

    const body = (await request.json()) as { id?: unknown; all?: unknown }
    const all = body.all === true
    const id = typeof body.id === 'number' ? body.id : Number(body.id)
    if (!all && !Number.isInteger(id)) {
      return NextResponse.json({ error: 'id or all is required' }, { status: 400 })
    }

    const scope = all
      ? { recipientId: teacher.id, readAt: null }
      : { id, recipientId: teacher.id, readAt: null }

    // Read the matching rows first: once they are marked read the type/params
    // needed to resolve the linked Sokrates notices can no longer be found.
    const affected = await prisma.notification.findMany({
      where: scope,
      select: { type: true, params: true },
    })

    const now = new Date()
    const result = await prisma.notification.updateMany({ where: scope, data: { readAt: now } })

    // The acknowledgement itself has committed by now, so resolving the linked
    // notices is best-effort: failing it would report a 500 for a dismissal the
    // user can already see took effect, and re-marking would be a no-op.
    await bestEffort('acknowledge:sokrates-notices', () =>
      resolveLinkedSokratesNotices(affected, teacher.id, now),
    )

    return NextResponse.json({ success: true, count: result.count })
  } catch (error) {
    captureError(error as Error, { location: 'api/notifications/acknowledge', type: 'acknowledge' })
    return NextResponse.json({ error: 'Failed to acknowledge notification' }, { status: 500 })
  }
}
