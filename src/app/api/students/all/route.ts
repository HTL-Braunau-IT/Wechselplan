import { prisma } from '@/lib/prisma'
import { captureError } from '~/lib/sentry'
import { ok, serverError } from '@/lib/api-response'
import { resolveSchoolYearId } from '@/lib/year-aware-class-staff'

/**
 * Handles GET requests to retrieve student records joined with their class
 * for the requested (or current) school year via `ClassMembership`. The
 * legacy `Student.classId` column is no longer consulted; if no membership
 * exists for the resolved year, `classId` and `class` come back `null`.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const schoolYearIdParam = searchParams.get('schoolYearId')
        let schoolYearId: number | null = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : null
        if (schoolYearId == null || Number.isNaN(schoolYearId)) {
            schoolYearId = await resolveSchoolYearId()
        }

        if (schoolYearId != null) {
            const memberships = await prisma.classMembership.findMany({
                where: { schoolYearId },
                include: {
                    student: true,
                    class: { select: { id: true, name: true } }
                },
                orderBy: [
                    { student: { lastName: 'asc' } },
                    { student: { firstName: 'asc' } }
                ]
            })
            const students = memberships.map((m) => ({
                ...m.student,
                classId: m.classId,
                class: m.class
            }))
            return ok(students)
        }

        // No school year configured at all; return students without class join.
        const students = await prisma.student.findMany({
            orderBy: [
                { lastName: 'asc' },
                { firstName: 'asc' }
            ]
        })
        return ok(students.map(s => ({ ...s, classId: null, class: null })))
    } catch (error) {
        captureError(error, {
            location: 'api/students/all',
            type: 'fetch-students'
        })
        return serverError('Failed to fetch students')
    }
}
