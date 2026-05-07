import { prisma } from '@/lib/prisma'

/**
 * Resolve the "default" school year id for code paths that don't have one
 * passed in explicitly. Picks the year that contains today; if none does,
 * falls back to the most recently started year. Returns `null` when no
 * SchoolYear rows exist at all.
 */
export async function resolveSchoolYearId(): Promise<number | null> {
    const now = new Date()
    const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true }
    })
    if (current) return current.id
    const fallback = await prisma.schoolYear.findFirst({
        orderBy: { startDate: 'desc' },
        select: { id: true }
    })
    return fallback?.id ?? null
}

export interface YearClassStaff {
    classHeadId: number | null
    classLeadId: number | null
}

/**
 * Look up the per-school-year class head/lead for a single class.
 * Returns nulls when no `ClassYearStaff` row exists for the given pair.
 */
export async function getClassYearStaff(
    classId: number,
    schoolYearId: number
): Promise<YearClassStaff> {
    const row = await prisma.classYearStaff.findUnique({
        where: { classId_schoolYearId: { classId, schoolYearId } },
        select: { classHeadId: true, classLeadId: true }
    })
    return {
        classHeadId: row?.classHeadId ?? null,
        classLeadId: row?.classLeadId ?? null
    }
}

/**
 * Bulk variant of {@link getClassYearStaff}: returns a map keyed by classId.
 * Missing rows are absent from the map (callers default to nulls).
 */
export async function getClassYearStaffMap(
    classIds: number[],
    schoolYearId: number
): Promise<Map<number, YearClassStaff>> {
    if (classIds.length === 0) return new Map()
    const rows = await prisma.classYearStaff.findMany({
        where: { schoolYearId, classId: { in: classIds } },
        select: { classId: true, classHeadId: true, classLeadId: true }
    })
    const map = new Map<number, YearClassStaff>()
    for (const row of rows) {
        map.set(row.classId, {
            classHeadId: row.classHeadId,
            classLeadId: row.classLeadId
        })
    }
    return map
}

/**
 * Upsert the staff row for a (class, schoolYear) pair, only changing the
 * fields that are explicitly provided. `null` clears the slot.
 */
export async function setClassYearStaff(
    classId: number,
    schoolYearId: number,
    data: Partial<YearClassStaff>
) {
    const update: { classHeadId?: number | null; classLeadId?: number | null } = {}
    if ('classHeadId' in data) update.classHeadId = data.classHeadId ?? null
    if ('classLeadId' in data) update.classLeadId = data.classLeadId ?? null

    return prisma.classYearStaff.upsert({
        where: { classId_schoolYearId: { classId, schoolYearId } },
        update,
        create: {
            classId,
            schoolYearId,
            classHeadId: data.classHeadId ?? null,
            classLeadId: data.classLeadId ?? null
        }
    })
}
