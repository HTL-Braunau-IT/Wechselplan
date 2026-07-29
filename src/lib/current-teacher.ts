import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'

/** The signed-in staff member mapped to their Teacher row (username is the key). */
export interface CurrentTeacher {
  id: number
  name: string
  role: unknown
}

/**
 * Resolves the session's Teacher row via the username, the same key the
 * Notensammler uses everywhere else. Admins may not have a Teacher row; the
 * caller decides whether that is fatal.
 */
export async function resolveCurrentTeacher(
  session: Session | null,
): Promise<CurrentTeacher | null> {
  const username = session?.user?.name
  if (!username) return null
  const teacher = await prisma.teacher.findUnique({
    where: { username },
    select: { id: true, firstName: true, lastName: true },
  })
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
