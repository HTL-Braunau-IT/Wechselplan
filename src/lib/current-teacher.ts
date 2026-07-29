import type { Session } from 'next-auth'
import { resolveSessionTeacher } from '@/lib/session-teacher'

/** The signed-in staff member, reduced to what a record about them needs. */
export interface CurrentTeacher {
  id: number
  /** Display name, snapshotted into records so they survive a later rename. */
  name: string
  role: unknown
}

/**
 * Resolves the session's Teacher row and reduces it to an identity plus a
 * display name. Admins may not have a Teacher row; the caller decides whether
 * that is fatal.
 *
 * The lookup itself belongs to {@link resolveSessionTeacher}: this used to key
 * on the username alone, which after the Entra migration matches almost nobody
 * — `session.user.name` is now a display name. Anything built on the old
 * behaviour saw teachers as strangers, which for notifications would have meant
 * an empty bell and an actor who never got excluded from their own edits.
 */
export async function resolveCurrentTeacher(
  session: Session | null,
): Promise<CurrentTeacher | null> {
  const teacher = await resolveSessionTeacher(session)
  if (!teacher) return null
  return {
    id: teacher.id,
    name: `${teacher.firstName} ${teacher.lastName}`,
    role: session?.user?.role,
  }
}

/**
 * Display name for whoever caused an action, for records that keep a
 * point-in-time snapshot of the actor rather than only a foreign key.
 */
export function actorName(teacher: CurrentTeacher | null, session: Session | null): string {
  return teacher?.name ?? session?.user?.name ?? 'Unbekannt'
}
