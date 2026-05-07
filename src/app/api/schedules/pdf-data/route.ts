import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { badRequest, notFound, ok, serverError } from '@/lib/api-response'
import { resolveSchoolYearId } from '@/lib/year-aware-class-staff'

/**
 * Handles GET requests to retrieve students in a specified class who have a
 * weekday group assignment (StudentWeekdayGroup) for the requested (or
 * current) school year. Class membership is sourced from ClassMembership.
 *
 * Returns the list of students with a 200 status on success, or an error
 * message with an appropriate status code on failure.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    try {
        const className = searchParams.get('className')

        if (!className) {
            const error = new Error('Class Name is required')
            captureError(error, {
                location: 'api/schedules/pdf-data',
                type: 'pdf-data-error'
            })
            return badRequest('Class Name is required')
        }

        const class_response = await prisma.class.findUnique({
            where: { name: className }
        })

        if (!class_response) {
            const error = new Error('Class not found')
            captureError(error, {
                location: 'api/schedules/pdf-data',
                type: 'pdf-data-error'
            })
            return notFound('Class not found')
        }

        const schoolYearIdParam = searchParams.get('schoolYearId')
        let schoolYearId: number | null = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : null
        if (schoolYearId == null || Number.isNaN(schoolYearId)) {
            schoolYearId = await resolveSchoolYearId()
        }
        if (schoolYearId == null) {
            return notFound('No school year found')
        }

        const memberships = await prisma.classMembership.findMany({
            where: { classId: class_response.id, schoolYearId },
            select: { studentId: true }
        })
        const studentIds = memberships.map(m => m.studentId)

        if (studentIds.length === 0) {
            return notFound('No students found')
        }

        const student_response = await prisma.student.findMany({
            where: {
                id: { in: studentIds },
                weekdayGroups: {
                    some: { schoolYearId }
                }
            }
        })

        if (student_response.length === 0) {
            return notFound('No students found')
        }

        return ok({ students: student_response })
    } catch (error) {
        captureError(error, {
            location: 'api/schedules/data',
            type: 'pdf_data_error',
            extra: { className: searchParams.get('className') }
        })
        return serverError('Internal server error')
    }
}
