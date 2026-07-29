import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { denyUnlessAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * POST /api/notifications/acknowledge
 * Body: { id } to acknowledge one, or { all: true } to acknowledge all.
 *
 * Only the recipient may acknowledge their own notifications — the update is
 * always scoped to the caller's teacher id, so an id belonging to someone else
 * matches nothing.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    const username = session?.user?.name
    if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const teacher = await prisma.teacher.findUnique({
      where: { username },
      select: { id: true },
    })
    if (!teacher) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

    const body = (await request.json()) as { id?: unknown; all?: unknown }
    const now = new Date()

    if (body.all === true) {
      const result = await prisma.sokratesChangeNotice.updateMany({
        where: { recipientId: teacher.id, acknowledgedAt: null },
        data: { acknowledgedAt: now },
      })
      return NextResponse.json({ success: true, count: result.count })
    }

    const id = typeof body.id === 'number' ? body.id : Number(body.id)
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: 'id or all is required' }, { status: 400 })
    }
    const result = await prisma.sokratesChangeNotice.updateMany({
      where: { id, recipientId: teacher.id, acknowledgedAt: null },
      data: { acknowledgedAt: now },
    })
    return NextResponse.json({ success: true, count: result.count })
  } catch (error) {
    captureError(error as Error, { location: 'api/notifications/acknowledge', type: 'acknowledge' })
    return NextResponse.json({ error: 'Failed to acknowledge notification' }, { status: 500 })
  }
}
