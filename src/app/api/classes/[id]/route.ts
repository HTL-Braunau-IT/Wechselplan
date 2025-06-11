import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'   // centralised, reused instance

const updateClassSchema = z.object({
     classHeadId: z.number().nullable().optional(),
     classLeadId: z.number().nullable().optional()
}).refine(data => data.classHeadId !== undefined || data.classLeadId !== undefined,
          { message: 'Nothing to update' })

/**
 * Handles PATCH requests to update a class's head and lead teachers.
 * 
 * @param request - The incoming request object
 * @param context - The route context containing the class ID
 * @returns A JSON response with the updated class or an error message
 */
export async function PATCH(
    request: Request,
    context: { params: { id: string } }
) {
    try {
        const { id } = context.params
        const classId = parseInt(id)
        
        if (isNaN(classId)) {
            return NextResponse.json(
                { error: 'Invalid class ID' },
                { status: 400 }
            )
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

        // Verify that the class exists
        const existingClass = await prisma.class.findUnique({
            where: { id: classId }
        })

        if (!existingClass) {
            return NextResponse.json(
                { error: 'Class not found' },
                { status: 404 }
            )
        }

        // If teacher IDs are provided, verify they exist
        if (updateData.classHeadId !== undefined) {
            const headTeacher = await prisma.teacher.findUnique({
                where: { id: updateData.classHeadId ?? 0 }
            })
            if (updateData.classHeadId && !headTeacher) {
                return NextResponse.json(
                    { error: 'Class head teacher not found' },
                    { status: 404 }
                )
            }
        }

        if (updateData.classLeadId !== undefined) {
            const leadTeacher = await prisma.teacher.findUnique({
                where: { id: updateData.classLeadId ?? 0 }
            })
            if (updateData.classLeadId && !leadTeacher) {
                return NextResponse.json(
                    { error: 'Class lead teacher not found' },
                    { status: 404 }
                )
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
        return NextResponse.json(
            { error: 'Failed to update class' },
            { status: 500 }
        )
    }
} 