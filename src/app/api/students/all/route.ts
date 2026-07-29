import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '~/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * Handles GET requests to retrieve student records.
 * When schoolYearId is provided, returns only students that have a ClassMembership for that year (with classId from that membership).
 * Otherwise returns all students ordered by last name and first name.
 *
 * @returns A JSON response containing the list of students, or an error message with status 500 if the query fails.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

    try {
        const { searchParams } = new URL(request.url)
        const schoolYearIdParam = searchParams.get('schoolYearId')
        const schoolYearId = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined

        if (schoolYearId != null && !Number.isNaN(schoolYearId)) {
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
            return NextResponse.json(students)
        }

        const students = await prisma.student.findMany({
            include: { class: true },
            orderBy: [
                { lastName: 'asc' },
                { firstName: 'asc' }
            ]
        })
        return NextResponse.json(students)
    } catch (error) {
        captureError(error, {
            location: 'api/students/all',
            type: 'fetch-students'
        })
        return NextResponse.json(
            { error: 'Failed to fetch students' },
            { status: 500 }
        )
    }
} 