import type { Session } from 'next-auth'
import { actorName, type CurrentTeacher } from '@/lib/current-teacher'
import { classLeadId, notensammlerLink, notifyQuietly } from '@/lib/notifications'

/**
 * Tells the Klassenleiter that a subject teacher has been working on their
 * class's grade sheet.
 *
 * The class lead is the one who has to collect a complete sheet before the
 * conference and type it into Sokrates, so "someone filled some of it in" is
 * the signal they are waiting on. This is the ordinary case; a change made
 * *after* the class was marked as transferred is the louder `sokrates-change`
 * notification instead (see src/lib/sokrates-lock.ts) — a save can raise both.
 *
 * Silent when nothing actually moved, and — because {@link notifyQuietly} drops
 * the actor — when the class lead is grading their own class.
 */
export async function notifyGradesEntered(params: {
  classId: number
  className: string
  schoolYearId: number
  actor: CurrentTeacher | null
  session: Session | null
  /** Grades whose value really changed and were written. */
  count: number
}): Promise<void> {
  if (params.count <= 0) return

  await notifyQuietly({
    type: 'grades-entered',
    recipientIds: [await classLeadId(params.classId)],
    actorId: params.actor?.id ?? null,
    actorName: actorName(params.actor, params.session),
    params: { className: params.className, count: params.count },
    link: notensammlerLink(params.className),
    // One collapsed entry per teacher and class: saving cell by cell must not
    // turn into one bell row per keystroke. The count is therefore the most
    // recent save's, matching the timestamp shown next to it.
    dedupeKey: `grades-entered:${params.classId}:${params.schoolYearId}:${params.actor?.id ?? 'admin'}`,
  })
}
