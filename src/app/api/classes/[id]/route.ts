import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { badRequest, notFound, ok, serverError, unprocessable } from '@/lib/api-response'
import { resolveSchoolYearId, setClassYearStaff, getClassYearStaff } from '@/lib/year-aware-class-staff'

const updateClassSchema = z.object({
  classHeadId: z.number().nullable().optional(),
  classLeadId: z.number().nullable().optional(),
  schoolYearId: z.number().int().positive().optional()
}).refine(
  data => data.classHeadId !== undefined || data.classLeadId !== undefined,
  { message: 'Nothing to update' }
)

/**
 * Handles PATCH requests to update a class entity by ID.
 *
 * Validates the class ID and request body, ensures referenced teachers exist if provided, and updates the class record with new data. Returns the updated class fields or an appropriate error response if validation or existence checks fail.
 *
 * @returns A JSON response containing the updated class data, or an error message with the corresponding HTTP status code.
 */
export async function PATCH(
  request: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any
) {
  try {
    const id = context?.params?.id
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const classId = parseInt(id)

    if (isNaN(classId)) {
      return badRequest('Invalid class ID')
    }

    const body = await request.json()
    const validationResult = updateClassSchema.safeParse(body)

    if (!validationResult.success) {
      return unprocessable('Validation failed', validationResult.error.format())
    }

    const updateData = validationResult.data

    const existingClass = await prisma.class.findUnique({
      where: { id: classId }
    })

    if (!existingClass) {
      captureError(new Error('Class not found'), {
        location: 'api/classes/[id]',
        type: 'update-class'
      })
      return notFound('Class not found')
    }

    if (updateData.classHeadId !== undefined && updateData.classHeadId !== null) {
      const headTeacher = await prisma.teacher.findUnique({
        where: { id: updateData.classHeadId }
      })
      if (!headTeacher) {
        captureError(new Error('Class head teacher not found'), {
          location: 'api/classes/[id]',
          type: 'update-class'
        })
        return notFound('Class head teacher not found')
      }
    }

    if (updateData.classLeadId !== undefined && updateData.classLeadId !== null) {
      const leadTeacher = await prisma.teacher.findUnique({
        where: { id: updateData.classLeadId }
      })
      if (!leadTeacher) {
        captureError(new Error('Class lead teacher not found'), {
          location: 'api/classes/[id]',
          type: 'update-class'
        })
        return notFound('Class lead teacher not found')
      }
    }

    const schoolYearId = updateData.schoolYearId ?? (await resolveSchoolYearId())
    if (schoolYearId == null) {
      return badRequest('No school year configured to write class head/lead against')
    }

    const staffPatch: { classHeadId?: number | null; classLeadId?: number | null } = {}
    if (updateData.classHeadId !== undefined) staffPatch.classHeadId = updateData.classHeadId
    if (updateData.classLeadId !== undefined) staffPatch.classLeadId = updateData.classLeadId

    await setClassYearStaff(classId, schoolYearId, staffPatch)

    const staff = await getClassYearStaff(classId, schoolYearId)
    return ok({
      id: existingClass.id,
      name: existingClass.name,
      description: existingClass.description,
      classHeadId: staff.classHeadId,
      classLeadId: staff.classLeadId
    })
  } catch (error) {
    captureError(error, {
      location: 'api/classes/[id]',
      type: 'update-class'
    })
    return serverError('Failed to update class')
  }
}
