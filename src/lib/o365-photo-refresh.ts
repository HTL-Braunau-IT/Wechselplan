import { prisma } from '@/lib/prisma'
import { refreshStudentO365PhotoCache } from '@/lib/student-photo-source'
import { refreshTeacherO365PhotoCache } from '@/lib/teacher-photo-source'

/**
 * Refresh the cached O365 photos for a set of students or teachers.
 *
 * Shared by the two Admin → photo `o365-refresh` routes, which were otherwise
 * byte-for-byte copies differing only in the noun. When `requestedIds` is a
 * non-empty array the refresh is scoped to those ids (positive integers only);
 * otherwise every Entra-synced person of that kind is refreshed (capped).
 */
export type PhotoEntityKind = 'student' | 'teacher'

export interface O365RefreshResult {
  total: number
  refreshed: number
  withPhoto: number
}

async function allEntraSyncedIds(kind: PhotoEntityKind): Promise<number[]> {
  const where = { externalSource: 'entra', externalId: { not: null } } as const
  if (kind === 'student') {
    const rows = await prisma.student.findMany({ where, select: { id: true }, take: 1000 })
    return rows.map(row => row.id)
  }
  const rows = await prisma.teacher.findMany({ where, select: { id: true }, take: 1000 })
  return rows.map(row => row.id)
}

export async function refreshO365Photos(
  kind: PhotoEntityKind,
  requestedIds: unknown,
): Promise<O365RefreshResult> {
  const ids =
    Array.isArray(requestedIds) && requestedIds.length > 0
      ? requestedIds
          .map(id => (typeof id === 'number' ? id : Number.NaN))
          .filter(id => Number.isInteger(id) && id > 0)
      : await allEntraSyncedIds(kind)

  const refresh =
    kind === 'student' ? refreshStudentO365PhotoCache : refreshTeacherO365PhotoCache

  let refreshed = 0
  let withPhoto = 0
  for (const id of ids) {
    const hasPhoto = await refresh(id)
    refreshed += 1
    if (hasPhoto) withPhoto += 1
  }

  return { total: ids.length, refreshed, withPhoto }
}
