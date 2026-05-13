import { prisma } from '@/lib/prisma'
import { resolveStudentPhoto, type ResolvedStudentPhoto } from '@/lib/student-photo-source'
import { resolveTeacherPhoto, type ResolvedTeacherPhoto } from '@/lib/teacher-photo-source'

export type ResolvedMePhoto = ResolvedTeacherPhoto | ResolvedStudentPhoto

type MeUser = {
  name: string
  id?: string | null
  role: 'admin' | 'teacher' | 'student'
}

async function findTeacherIdForMe(user: MeUser): Promise<number | null> {
  const byUsername = await prisma.teacher.findFirst({
    where: { username: user.name },
    select: { id: true },
  })
  if (byUsername) return byUsername.id

  const oid = user.id?.trim()
  if (!oid) return null

  const byExternal = await prisma.teacher.findFirst({
    where: { externalId: oid },
    select: { id: true },
  })
  return byExternal?.id ?? null
}

async function findStudentIdForMe(user: MeUser): Promise<number | null> {
  const byUsername = await prisma.student.findFirst({
    where: { username: user.name },
    select: { id: true },
  })
  if (byUsername) return byUsername.id

  const oid = user.id?.trim()
  if (!oid) return null

  const byExternal = await prisma.student.findFirst({
    where: { externalId: oid },
    select: { id: true },
  })
  return byExternal?.id ?? null
}

/**
 * Resolves the current user's profile photo using the same rules as GET /api/me/photo.
 * Teacher/admin: lookup by normalized username, then by Entra object id (`user.id` / `externalId`).
 */
export async function resolveMeProfilePhoto(user: MeUser): Promise<ResolvedMePhoto | null> {
  if (user.role === 'teacher' || user.role === 'admin') {
    const teacherId = await findTeacherIdForMe(user)
    if (teacherId != null) {
      return resolveTeacherPhoto(teacherId)
    }
    return null
  }

  if (user.role === 'student') {
    const studentId = await findStudentIdForMe(user)
    if (studentId != null) {
      return resolveStudentPhoto(studentId)
    }
  }

  return null
}
