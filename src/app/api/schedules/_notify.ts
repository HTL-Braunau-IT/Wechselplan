import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { actorName, type CurrentTeacher } from '@/lib/current-teacher'
import { classAudience, notify, scheduleAuthors, scheduleLink } from '@/lib/notifications'
import type { NotificationType } from '@/types/notifications'

/** The schedule-shaped notification types, all of which take just a class name. */
type ScheduleNotificationType = Extract<NotificationType, `schedule-${string}`>

/**
 * Tells everyone attached to a class that its rotation plan moved.
 *
 * The audience is the union of who teaches the class now, who authored a plan
 * for it, and — via `alsoNotify` — whoever the caller knows was attached before
 * the change. That last part matters: a teacher removed from the rotation is no
 * longer in any of the derived sets, and is precisely the person who needs to
 * be told.
 *
 * Wholly best-effort. A plan that saved must not come back as a 500 because the
 * bell could not be rung, so every failure in here is reported and swallowed.
 */
export async function notifyScheduleChange(params: {
  type: ScheduleNotificationType
  classId: number
  schoolYearId: number
  actor: CurrentTeacher | null
  session: Session | null
  /** Teachers attached to the class *before* the change, if the caller has them. */
  alsoNotify?: readonly number[]
}): Promise<void> {
  try {
    const classRecord = await prisma.class.findUnique({
      where: { id: params.classId },
      select: { name: true },
    })
    if (!classRecord) return

    await notify({
      type: params.type,
      recipientIds: [
        ...(params.alsoNotify ?? []),
        ...(await classAudience(params.classId, params.schoolYearId)),
        ...(await scheduleAuthors(params.classId, params.schoolYearId)),
      ],
      actorId: params.actor?.id ?? null,
      actorName: actorName(params.actor, params.session),
      params: { className: classRecord.name },
      link: scheduleLink(classRecord.name),
      // One key for every kind of schedule edit. Building a plan walks the
      // wizard through three separate endpoints, and a colleague wants one line
      // saying that class's plan moved — not three, a minute apart.
      dedupeKey: `schedule:${params.classId}:${params.schoolYearId}`,
    })
  } catch (error) {
    captureError(error as Error, {
      location: 'api/schedules/_notify',
      type: 'notify-schedule-change',
      extra: { notificationType: params.type, classId: params.classId },
    })
  }
}
