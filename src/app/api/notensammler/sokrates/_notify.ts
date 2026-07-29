import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import type { Semester } from '@/lib/grades'
import type { CurrentTeacher } from '@/lib/current-teacher'
import {
  bestEffort,
  clearSokratesChangeNotifications,
  gradeColumnTeachers,
  notensammlerLink,
  notify,
} from '@/lib/notifications'
import type { SokratesLockScope } from '@/types/notifications'

/**
 * Notifications raised when the class lead changes the Sokrates state of a
 * grade sheet.
 *
 * Every helper here runs *after* the state change has committed, so each wraps
 * its whole body — recipient lookups included — in {@link bestEffort}. Letting a
 * failed lookup escape would report a 500 for a mark or lock that in fact
 * succeeded, and the class lead would set it a second time.
 */

interface SokratesNotifyContext {
  classId: number
  schoolYearId: number
  semester: Semester
  actor: CurrentTeacher | null
  session: Session | null
}

const who = (context: SokratesNotifyContext) =>
  context.actor?.name ?? context.session?.user?.name ?? 'Administrator'

const className = async (classId: number) =>
  (await prisma.class.findUnique({ where: { id: classId }, select: { name: true } }))?.name ?? null

/**
 * The class+semester has been recorded as entered into Sokrates. Everyone
 * holding a column in the sheet needs to know: from here their edits are either
 * blocked outright or reported to the class lead.
 *
 * Re-marking also resolves the change notices, so the matching bell entries are
 * closed at the same time — otherwise the two views would disagree about
 * whether the drift had been dealt with.
 */
export async function notifySokratesMarked(
  context: SokratesNotifyContext & { readAt: Date },
): Promise<void> {
  await bestEffort('sokrates-marked', async () => {
    await clearSokratesChangeNotifications({
      classId: context.classId,
      schoolYearId: context.schoolYearId,
      semester: context.semester,
      readAt: context.readAt,
    })

    const name = await className(context.classId)
    if (!name) return

    await notify({
      type: 'sokrates-marked',
      recipientIds: await gradeColumnTeachers(context.classId, context.schoolYearId),
      actorId: context.actor?.id ?? null,
      actorName: who(context),
      params: { className: name, semester: context.semester },
      link: notensammlerLink(name),
      dedupeKey: `sokrates:${context.classId}:${context.schoolYearId}:${context.semester}`,
    })
  })
}

/** The mark was withdrawn; the sheet is open again. */
export async function notifySokratesUnmarked(context: SokratesNotifyContext): Promise<void> {
  await bestEffort('sokrates-unmarked', async () => {
    // The mark's own change notices died with the transfer it cascaded from, so
    // the bell entries pointing at them have to be closed here.
    await clearSokratesChangeNotifications({
      classId: context.classId,
      schoolYearId: context.schoolYearId,
      semester: context.semester,
      readAt: new Date(),
    })

    const name = await className(context.classId)
    if (!name) return

    await notify({
      type: 'sokrates-unmarked',
      recipientIds: await gradeColumnTeachers(context.classId, context.schoolYearId),
      actorId: context.actor?.id ?? null,
      actorName: who(context),
      params: { className: name, semester: context.semester },
      link: notensammlerLink(name),
      dedupeKey: `sokrates:${context.classId}:${context.schoolYearId}:${context.semester}`,
    })
  })
}

/**
 * A hard lock was applied or lifted. `scope: 'all'` reaches every column owner;
 * `scope: 'teacher'` only the one whose column moved.
 */
export async function notifySokratesLock(
  context: SokratesNotifyContext & {
    locked: boolean
    scope: SokratesLockScope
    /** Required for `scope: 'teacher'`; the caller has already validated it. */
    teacherId: number | null
  },
): Promise<void> {
  await bestEffort('sokrates-lock', async () => {
    const name = await className(context.classId)
    if (!name) return

    await notify({
      type: context.locked ? 'sokrates-locked' : 'sokrates-unlocked',
      recipientIds:
        context.scope === 'all'
          ? await gradeColumnTeachers(context.classId, context.schoolYearId)
          : [context.teacherId],
      actorId: context.actor?.id ?? null,
      actorName: who(context),
      params: { className: name, semester: context.semester, scope: context.scope },
      link: notensammlerLink(name),
      // Separate from the mark's key: a lock is a different thing to be told
      // about, and a teacher who has read "this is in Sokrates now" still needs
      // to hear that their column has since been frozen.
      dedupeKey: `sokrates-lock:${context.classId}:${context.schoolYearId}:${context.semester}:${context.scope}`,
    })
  })
}
