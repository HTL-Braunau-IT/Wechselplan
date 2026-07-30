import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { resolveCurrentTeacher } from '@/lib/current-teacher'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MAX_NOTIFICATIONS = 100

/**
 * GET /api/notifications
 *
 * The signed-in teacher's in-app notifications, unread first and newest first
 * within each group. Read ones are included so the bell can show recent
 * history; `src/lib/notifications.ts` prunes them after 90 days.
 *
 * The rows carry a `type` and its interpolation `params` rather than a rendered
 * sentence — the bell turns those into text via i18next, so a notification
 * written months ago still renders in the reader's language.
 */
export async function GET() {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    // Admins without a Teacher row have no inbox; that is not an error.
    const teacher = await resolveCurrentTeacher(session)
    if (!teacher) return NextResponse.json({ notifications: [], unreadCount: 0 })

    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { recipientId: teacher.id },
        // Unread (null) first, then newest — nulls: 'first' is explicit so the
        // intent survives any change to Prisma's default null placement.
        orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
        take: MAX_NOTIFICATIONS,
      }),
      // Counted separately rather than off `rows`: past MAX_NOTIFICATIONS unread
      // the window is entirely unread, and deriving the badge from it would cap
      // the count at the page size instead of reporting the real backlog.
      prisma.notification.count({ where: { recipientId: teacher.id, readAt: null } }),
    ])

    const notifications = rows.map(row => ({
      id: row.id,
      type: row.type,
      params: row.params,
      link: row.link,
      actorName: row.actorName,
      createdAt: row.createdAt.toISOString(),
      read: row.readAt != null,
    }))

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    captureError(error as Error, { location: 'api/notifications', type: 'list' })
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 })
  }
}
