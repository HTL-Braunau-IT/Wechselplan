/**
 * In-app notifications.
 *
 * The domain tables stay the record of what happened; this module is only the
 * delivery channel that puts a line in someone's bell. Writers call
 * {@link notifyQuietly} from inside a mutation, so a notification that cannot
 * be written never fails the save that triggered it.
 *
 * A notification stores a `type` and its interpolation `params`, never a
 * rendered sentence — the message text lives in the i18next catalogue and is
 * rendered by `src/components/notification-bell.tsx`. `NotificationParams` in
 * `src/types/notifications.ts` is the contract between the two.
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import type { Semester } from '@/lib/grades'
import type { NotificationParams, NotificationType } from '@/types/notifications'

/** Read notifications are pruned after this many days. */
const RETENTION_DAYS = 90

export interface NotifyInput<T extends NotificationType> {
  type: T
  /** Candidate recipients. Duplicates, nulls and the actor are dropped. */
  recipientIds: readonly (number | null | undefined)[]
  /** Teacher who triggered it; null for an admin without a Teacher row. */
  actorId: number | null
  actorName: string
  params: NotificationParams[T]
  /** In-app path opened when the row is clicked. */
  link?: string
  /**
   * Collapse key. An unread row with the same recipient, type and key is
   * refreshed instead of duplicated — without it, a teacher who hits save
   * fifty times buries the class lead's bell.
   */
  dedupeKey?: string
}

/**
 * Narrows a candidate list to teachers who should actually be told: no
 * duplicates, no blanks, never the person who caused the event, and no
 * accounts that directory sync has deactivated (the default `isActive` filter
 * on `teacher.findMany` does that last part).
 */
async function resolveRecipients(
  candidates: readonly (number | null | undefined)[],
  actorId: number | null,
): Promise<number[]> {
  const ids = [...new Set(candidates.filter((id): id is number => typeof id === 'number'))].filter(
    id => id !== actorId,
  )
  if (ids.length === 0) return []

  const active = await prisma.teacher.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  })
  return active.map(teacher => teacher.id)
}

/**
 * Writes one notification per recipient.
 *
 * @returns the number of teachers notified (created plus refreshed).
 */
export async function notify<T extends NotificationType>(input: NotifyInput<T>): Promise<number> {
  const { type, actorId, actorName, params, link, dedupeKey } = input

  const recipients = await resolveRecipients(input.recipientIds, actorId)
  if (recipients.length === 0) return 0

  const now = new Date()
  const payload = {
    type,
    params: params as Prisma.InputJsonValue,
    link: link ?? null,
    actorId,
    actorName,
    dedupeKey: dedupeKey ?? null,
  }

  // Collapse onto an existing unread row where one exists, so repeated saves
  // stay a single, up-to-date entry rather than a stack of near-identical ones.
  const existing = dedupeKey
    ? await prisma.notification.findMany({
        where: { recipientId: { in: recipients }, type, dedupeKey, readAt: null },
        select: { id: true, recipientId: true },
      })
    : []

  if (existing.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: existing.map(row => row.id) } },
      // createdAt moves too: the bell sorts newest first, and a collapsed row
      // describes the most recent occurrence, not the first one.
      data: { ...payload, createdAt: now },
    })
  }

  const refreshed = new Set(existing.map(row => row.recipientId))
  const fresh = recipients.filter(id => !refreshed.has(id))
  if (fresh.length > 0) {
    await prisma.notification.createMany({
      data: fresh.map(recipientId => ({ recipientId, ...payload })),
    })
  }

  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  await prisma.notification.deleteMany({
    where: { recipientId: { in: recipients }, readAt: { lt: cutoff } },
  })

  return recipients.length
}

/**
 * {@link notify}, but a failure is reported and swallowed. Notifications are a
 * side channel: losing one must never roll back the schedule or grade save that
 * produced it.
 */
export async function notifyQuietly<T extends NotificationType>(
  input: NotifyInput<T>,
): Promise<void> {
  try {
    await notify(input)
  } catch (error) {
    captureError(error as Error, {
      location: 'lib/notifications',
      type: 'notify',
      extra: { notificationType: input.type },
    })
  }
}

/**
 * Everyone with a stake in a class: the teachers who hold an assignment or a
 * rotation slot in it, plus its Klassenvorstand and Klassenleiter.
 *
 * `TeacherRotation` carries no school year, so it is matched on the class
 * alone — a stale rotation row means one extra recipient, never a missed one.
 */
export async function classAudience(classId: number, schoolYearId: number): Promise<number[]> {
  const [assignments, rotations, classRecord] = await Promise.all([
    prisma.teacherAssignment.findMany({
      where: { classId, schoolYearId },
      select: { teacherId: true },
      distinct: ['teacherId'],
    }),
    prisma.teacherRotation.findMany({
      where: { classId },
      select: { teacherId: true },
      distinct: ['teacherId'],
    }),
    prisma.class.findUnique({
      where: { id: classId },
      select: { classLeadId: true, classHeadId: true },
    }),
  ])

  return [
    ...assignments.map(a => a.teacherId),
    ...rotations.map(r => r.teacherId),
    classRecord?.classLeadId,
    classRecord?.classHeadId,
  ].filter((id): id is number => typeof id === 'number')
}

/** Teachers who created a rotation plan for this class in this school year. */
export async function scheduleAuthors(classId: number, schoolYearId: number): Promise<number[]> {
  const schedules = await prisma.schedule.findMany({
    where: { classId, schoolYearId, createdById: { not: null } },
    select: { createdById: true },
    distinct: ['createdById'],
  })
  return schedules
    .map(schedule => schedule.createdById)
    .filter((id): id is number => typeof id === 'number')
}

/**
 * Teachers who own a column in a class's Notensammler sheet, i.e. everyone
 * whose grades a Sokrates mark or lock would freeze. Read from the grades
 * themselves rather than from the assignments: the sheet is what the lock acts
 * on, and a teacher can hold grades in a class they no longer teach.
 */
export async function gradeColumnTeachers(
  classId: number,
  schoolYearId: number,
): Promise<number[]> {
  const columns = await prisma.grade.findMany({
    where: { classId, schoolYearId },
    select: { teacherId: true },
    distinct: ['teacherId'],
  })
  return columns.map(column => column.teacherId)
}

/**
 * Marks every unread `sokrates-change` entry for a class+semester as read.
 *
 * Called when the class lead re-marks the semester as entered into Sokrates:
 * the drift they were being told about is resolved, so the bell should not keep
 * asking about it.
 */
export async function clearSokratesChangeNotifications(params: {
  classId: number
  schoolYearId: number
  semester: Semester
  readAt: Date
}): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      type: 'sokrates-change',
      dedupeKey: sokratesChangeDedupeKey(params),
      readAt: null,
    },
    data: { readAt: params.readAt },
  })
}

/** Collapse key shared by the writer in sokrates-lock.ts and the clear above. */
export const sokratesChangeDedupeKey = (params: {
  classId: number
  schoolYearId: number
  semester: Semester
}) => `sokrates-change:${params.classId}:${params.schoolYearId}:${params.semester}`

/** The Klassenleiter of a class, or null when none is set. */
export async function classLeadId(classId: number): Promise<number | null> {
  const classRecord = await prisma.class.findUnique({
    where: { id: classId },
    select: { classLeadId: true },
  })
  return classRecord?.classLeadId ?? null
}

/** Deep link into the Notensammler for a class. */
export const notensammlerLink = (className: string) =>
  `/notensammler?class=${encodeURIComponent(className)}`

/** Deep link into the schedule view for a class. */
export const scheduleLink = (className: string) =>
  `/schedules?class=${encodeURIComponent(className)}`
