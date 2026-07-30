/**
 * The contract between whoever writes an in-app notification (server:
 * `src/lib/notifications.ts`) and whoever renders one (client:
 * `src/components/notification-bell.tsx`).
 *
 * A stored notification holds a `type` and its interpolation `params`, never a
 * rendered sentence, so an entry written months ago still reads in whichever
 * language its recipient has selected. Adding a type here therefore means
 * adding a message to `public/locales/*\/common.json` — the bell's renderer is
 * exhaustive over this union and will not compile otherwise.
 *
 * This file must stay free of server-only imports: it is pulled into the client
 * bundle.
 */

import type { Semester } from '@/lib/grades'

/** Whether a Sokrates lock covers the whole class or a single column. */
export type SokratesLockScope = 'all' | 'teacher'

/** Per-type interpolation values. */
export interface NotificationParams {
  /** A rotation plan was created for a class. */
  'schedule-created': { className: string }
  /** An existing rotation plan was regenerated, or its dates/turns changed. */
  'schedule-updated': { className: string }
  /** The teacher/subject/room assignments behind a plan changed. */
  'schedule-assignments-changed': { className: string }
  /** The per-turn teacher rotation behind a plan changed. */
  'schedule-rotation-changed': { className: string }
  /**
   * The students behind a plan changed: someone entered or left the class, or
   * was moved into a different group.
   */
  'schedule-students-changed': { className: string }
  /** A subject teacher saved grades in the Notensammler. */
  'grades-entered': { className: string; count: number }
  /** The class lead marked a class+semester as entered into Sokrates. */
  'sokrates-marked': { className: string; semester: Semester }
  /** The class lead withdrew that mark. */
  'sokrates-unmarked': { className: string; semester: Semester }
  /** Grades were hard-locked (the whole class, or one teacher's column). */
  'sokrates-locked': { className: string; semester: Semester; scope: SokratesLockScope }
  /** That hard lock was lifted again. */
  'sokrates-unlocked': { className: string; semester: Semester; scope: SokratesLockScope }
  /**
   * Grades moved after the class was marked as entered into Sokrates.
   * `classId`/`schoolYearId` travel along so acknowledging the bell can also
   * clear the drift markers in the Notensammler grid; `count` is the number of
   * still-open notices, which stays right when entries collapse together.
   */
  'sokrates-change': {
    className: string
    semester: Semester
    count: number
    classId: number
    schoolYearId: number
  }
  /**
   * The class lead acknowledged the post-Sokrates grade changes a teacher made,
   * closing the loop for the person who made them: proof the lead has actually
   * seen the drift. `count` is how many of the acknowledger's changes were
   * cleared, so the message can read in singular or plural.
   */
  'sokrates-change-acknowledged': {
    className: string
    semester: Semester
    count: number
  }
}

export type NotificationType = keyof NotificationParams

export const NOTIFICATION_TYPES = [
  'schedule-created',
  'schedule-updated',
  'schedule-assignments-changed',
  'schedule-rotation-changed',
  'schedule-students-changed',
  'grades-entered',
  'sokrates-marked',
  'sokrates-unmarked',
  'sokrates-locked',
  'sokrates-unlocked',
  'sokrates-change',
  'sokrates-change-acknowledged',
] as const satisfies readonly NotificationType[]

export function isKnownNotificationType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type)
}

/**
 * The i18next keys each type can render through.
 *
 * Kept here rather than in the bell so a test can check the locale catalogue
 * against it: a type added without a message would otherwise ship as a row that
 * displays its own key. A type lists more than one key when the wording depends
 * on a param — a lock covering the whole class reads differently from one
 * covering only your own column.
 *
 * `plural: true` marks a message that interpolates `count`, which i18next
 * resolves through `_one`/`_other` suffixes rather than the bare key.
 */
export const NOTIFICATION_MESSAGE_KEYS = {
  'schedule-created': [{ key: 'notifications.scheduleCreated' }],
  'schedule-updated': [{ key: 'notifications.scheduleUpdated' }],
  'schedule-assignments-changed': [{ key: 'notifications.scheduleAssignmentsChanged' }],
  'schedule-rotation-changed': [{ key: 'notifications.scheduleRotationChanged' }],
  'schedule-students-changed': [{ key: 'notifications.scheduleStudentsChanged' }],
  'grades-entered': [{ key: 'notifications.gradesEntered', plural: true }],
  'sokrates-marked': [{ key: 'notifications.sokratesMarked' }],
  'sokrates-unmarked': [{ key: 'notifications.sokratesUnmarked' }],
  'sokrates-locked': [
    { key: 'notifications.sokratesLockedAll' },
    { key: 'notifications.sokratesLockedMine' },
  ],
  'sokrates-unlocked': [
    { key: 'notifications.sokratesUnlockedAll' },
    { key: 'notifications.sokratesUnlockedMine' },
  ],
  'sokrates-change': [{ key: 'notifications.sokratesChange', plural: true }],
  'sokrates-change-acknowledged': [
    { key: 'notifications.sokratesChangeAcknowledged', plural: true },
  ],
} as const satisfies Record<NotificationType, readonly { key: string; plural?: boolean }[]>

/** The keys one notification type may render through. */
export type NotificationMessageKey<T extends NotificationType> =
  (typeof NOTIFICATION_MESSAGE_KEYS)[T][number]['key']

/** One row as served by `GET /api/notifications`. */
export interface NotificationDto {
  id: number
  /** Kept as a plain string: a client on an older bundle may not know it yet. */
  type: string
  params: unknown
  link: string | null
  actorName: string
  createdAt: string
  read: boolean
}
