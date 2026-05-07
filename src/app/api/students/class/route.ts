import { prisma } from '@/lib/prisma'
import { captureError } from '~/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { badRequest, notFound, ok, serverError } from '@/lib/api-response'
import { resolveSchoolYearId } from '@/lib/year-aware-class-staff'

/**
 * Processes a GET request to retrieve the class name and group ID assigned
 * to a student by username for the requested (or current) school year.
 *
 * Class membership is now sourced exclusively from `ClassMembership`. The
 * legacy `Student.classId` column is no longer consulted.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const rawUsername = searchParams.get('username')
    if (!rawUsername) {
        return badRequest('Username parameter is required')
    }
    const username = normalizeUsername(rawUsername)
    if (!username) {
        return badRequest('Username parameter is required')
    }

    const schoolYearIdParam = searchParams.get('schoolYearId')
    const selectedWeekdayParam = searchParams.get('selectedWeekday')
    const selectedWeekday = selectedWeekdayParam ? parseInt(selectedWeekdayParam, 10) : 1

    try {
        const student = await prisma.student.findUnique({
            where: { username }
        })

        if (!student) {
            console.warn('[username-match] Student not found', { raw: rawUsername, normalized: username })
            return notFound('Student not found')
        }

        let schoolYearId: number | null = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : null
        if (schoolYearId == null || Number.isNaN(schoolYearId)) {
            schoolYearId = await resolveSchoolYearId()
        }

        if (schoolYearId == null) {
            return notFound('Student has no class assigned')
        }

        const membership = await prisma.classMembership.findUnique({
            where: { studentId_schoolYearId: { studentId: student.id, schoolYearId } },
            include: { class: { select: { name: true } } }
        })

        if (!membership?.class) {
            return notFound('Student has no class assigned')
        }

        const weekdayGroup = await prisma.studentWeekdayGroup.findUnique({
            where: {
                studentId_schoolYearId_weekday: {
                    studentId: student.id,
                    schoolYearId,
                    weekday: selectedWeekday
                }
            },
            select: { groupId: true }
        })

        return ok({
            class: membership.class.name,
            groupId: weekdayGroup?.groupId ?? null
        })
    } catch (error) {
        captureError(error, {
            location: 'api/students/class',
            type: 'fetch-student-class'
        })
        return serverError('Failed to fetch student class')
    }
}
