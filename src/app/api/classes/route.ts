import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { ok, serverError } from '@/lib/api-response'
import { resolveSchoolYearId } from '@/lib/year-aware-class-staff'

/**
 * Retrieves all classes from the database and returns them as a JSON array.
 * When schoolYearId is provided, returns only classes that have at least one Schedule, ClassMembership, or TeacherAssignment in that year.
 *
 * Each class object includes `id`, `name`, `description`, `classHeadId`, and `classLeadId`, ordered alphabetically by name.
 *
 * @returns A JSON response containing the list of classes, or an error message with status 500 if retrieval fails.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const schoolYearIdParam = searchParams.get('schoolYearId')
        const schoolYearId = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
        const filterYearId = schoolYearId != null && !Number.isNaN(schoolYearId) ? schoolYearId : undefined

        const where =
            filterYearId != null
                ? {
                      isActive: true,
                      OR: [
                          { schedules: { some: { schoolYearId: filterYearId } } },
                          { classMemberships: { some: { schoolYearId: filterYearId } } },
                          { assignments: { some: { schoolYearId: filterYearId } } }
                      ]
                  }
                : undefined

        const classes = await prisma.class.findMany({
            where,
            select: {
                id: true,
                name: true,
                description: true
            },
            orderBy: { name: 'asc' }
        })

        const yearStaffYearId = filterYearId ?? (await resolveSchoolYearId())
        const yearStaff = yearStaffYearId != null
            ? await prisma.classYearStaff.findMany({
                  where: { schoolYearId: yearStaffYearId, classId: { in: classes.map(c => c.id) } },
                  select: { classId: true, classHeadId: true, classLeadId: true }
              })
            : []
        const staffByClass = new Map<number, { classHeadId: number | null; classLeadId: number | null }>()
        for (const row of yearStaff) {
            staffByClass.set(row.classId, {
                classHeadId: row.classHeadId,
                classLeadId: row.classLeadId
            })
        }

        const enriched = classes.map(c => ({
            ...c,
            classHeadId: staffByClass.get(c.id)?.classHeadId ?? null,
            classLeadId: staffByClass.get(c.id)?.classLeadId ?? null
        }))

        return ok(enriched)
    } catch (error) {
        captureError(error, {
            location: 'api/classes',
            type: 'fetch-classes'
        })
        return serverError('Failed to fetch classes')
    }
}
