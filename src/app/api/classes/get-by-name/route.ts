import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { badRequest, notFound, ok, serverError } from '@/lib/api-response'
import { resolveSchoolYearId } from '@/lib/year-aware-class-staff'

/**
 * Handles GET requests to retrieve class information by its name.
 *
 * Extracts the `name` query parameter from the request URL and returns the matching class data as JSON, including related `classHead` and `classLead` names resolved for the requested (or current) school year. Responds with a 400 status if the `name` parameter is missing, 404 if the class is not found, or 500 if an internal error occurs.
 *
 * @returns A JSON response containing the class data or an error message with the appropriate HTTP status code.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')
    const schoolYearIdParam = searchParams.get('schoolYearId')

    if (!name) {
      return badRequest('Class name is required')
    }

    const classData = await prisma.class.findUnique({
      where: { name }
    })

    if (!classData) {
      return notFound('Class not found')
    }

    let schoolYearId: number | null = schoolYearIdParam ? Number(schoolYearIdParam) : null
    if (schoolYearId == null || Number.isNaN(schoolYearId)) {
      schoolYearId = await resolveSchoolYearId()
    }

    const yearStaff = schoolYearId != null
      ? await prisma.classYearStaff.findUnique({
          where: { classId_schoolYearId: { classId: classData.id, schoolYearId } },
          include: {
            classHead: { select: { firstName: true, lastName: true } },
            classLead: { select: { firstName: true, lastName: true } }
          }
        })
      : null

    return ok({
      ...classData,
      classHeadId: yearStaff?.classHeadId ?? null,
      classLeadId: yearStaff?.classLeadId ?? null,
      classHead: yearStaff?.classHead ?? null,
      classLead: yearStaff?.classLead ?? null
    })
  } catch (error) {
    captureError(error, {
      location: 'api/classes/get-by-name',
      type: 'fetch-class-by-name',
      extra: {
        searchParams: Object.fromEntries(new URL(request.url).searchParams)
      }
    })
    return serverError('Failed to fetch class')
  }
}
