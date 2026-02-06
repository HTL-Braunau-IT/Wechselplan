import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

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

        const where =
            schoolYearId != null && !Number.isNaN(schoolYearId)
                ? {
                      OR: [
                          { schedules: { some: { schoolYearId } } },
                          { classMemberships: { some: { schoolYearId } } },
                          { assignments: { some: { schoolYearId } } }
                      ]
                  }
                : undefined

        const classes = await prisma.class.findMany({
            where,
            select: {
                id: true,
                name: true,
                description: true,
                classHeadId: true,
                classLeadId: true
            },
            orderBy: { name: 'asc' }
        })

        return NextResponse.json(classes)
    } catch (error) {
        captureError(error, {
            location: 'api/classes',
            type: 'fetch-classes'
        })
        return NextResponse.json(
            { error: 'Failed to fetch classes' },
            { status: 500 }
        )
    }
} 