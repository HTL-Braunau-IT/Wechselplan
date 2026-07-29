import { prisma } from '@/lib/prisma'
import type { Semester } from '@/lib/grades'

// Re-exported so the sokrates route handlers can import everything from here.
export { resolveCurrentTeacher, type CurrentTeacher } from '@/lib/sokrates-lock'

/** Resolves a school-year id from a query/body value, falling back to current. */
export async function resolveSchoolYearId(raw: unknown): Promise<number | null> {
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  if (Number.isInteger(parsed)) return parsed

  const now = new Date()
  const current = await prisma.schoolYear.findFirst({
    where: { startDate: { lte: now }, endDate: { gte: now } },
    select: { id: true },
  })
  if (current) return current.id
  const latest = await prisma.schoolYear.findFirst({
    orderBy: { startDate: 'desc' },
    select: { id: true },
  })
  return latest?.id ?? null
}

export function parseSemester(raw: unknown): Semester | null {
  return raw === 'first' || raw === 'second' ? raw : null
}

export function parseId(raw: unknown): number | null {
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN
  return Number.isInteger(parsed) ? parsed : null
}
