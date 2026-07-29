import { prisma } from '@/lib/prisma'

/**
 * Resolves a school-year id from a request value, falling back to the year that
 * contains today and then to the most recent one.
 *
 * Most records in the app are scoped by school year, and nearly every route
 * accepts an optional `schoolYearId` and otherwise picks the current one. This
 * is that rule in one place.
 */
export async function resolveSchoolYearId(raw?: unknown): Promise<number | null> {
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
