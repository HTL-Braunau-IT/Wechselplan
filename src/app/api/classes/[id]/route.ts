import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'

// Validation schema
const updateClassSchema = z.object({
  classHeadId: z.number().nullable().optional(),
  classLeadId: z.number().nullable().optional()
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
      return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })
    }

    const body = await request.json()
    const validationResult = updateClassSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.format() },
        { status: 400 }
      )
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
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
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
        return NextResponse.json({ error: 'Class head teacher not found' }, { status: 404 })
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
        return NextResponse.json({ error: 'Class lead teacher not found' }, { status: 404 })
      }
    }

    const updatedClass = await prisma.class.update({
      where: { id: classId },
      data: updateData,
      select: {
        id: true,
        name: true,
        description: true,
        classHeadId: true,
        classLeadId: true
      }
    })

    return NextResponse.json(updatedClass)
  } catch (error) {
    captureError(error, {
      location: 'api/classes/[id]',
      type: 'update-class'
    })
    return NextResponse.json({ error: 'Failed to update class' }, { status: 500 })
  }
}
