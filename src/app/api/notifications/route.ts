import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { denyUnlessAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_NOTIFICATIONS = 100

/**
 * GET /api/notifications
 *
 * In-app notifications for the signed-in teacher. Currently these are Sokrates
 * change notices addressed to them as a class lead: a subject teacher changed a
 * grade after the class was marked as entered into Sokrates. Unacknowledged
 * first; acknowledged (recent) included so the bell can show history.
 */
export async function GET() {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    const username = session?.user?.name
    if (!username) return NextResponse.json({ notifications: [], unreadCount: 0 })

    const teacher = await prisma.teacher.findUnique({
      where: { username },
      select: { id: true },
    })
    if (!teacher) return NextResponse.json({ notifications: [], unreadCount: 0 })

    const notices = await prisma.sokratesChangeNotice.findMany({
      where: { recipientId: teacher.id },
      orderBy: [{ acknowledgedAt: 'asc' }, { changedAt: 'desc' }],
      take: MAX_NOTIFICATIONS,
    })

    const notifications = notices.map(notice => ({
      id: notice.id,
      type: 'sokrates-change' as const,
      classId: notice.classId,
      className: notice.className,
      semester: notice.semester,
      studentName: notice.studentName,
      subjectTeacherName: notice.subjectTeacherName,
      oldGrade: notice.oldGrade,
      newGrade: notice.newGrade,
      changedByName: notice.changedByName,
      changedAt: notice.changedAt.toISOString(),
      acknowledged: notice.acknowledgedAt != null,
    }))
    const unreadCount = notifications.filter(n => !n.acknowledged).length

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    captureError(error as Error, { location: 'api/notifications', type: 'list' })
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 })
  }
}
