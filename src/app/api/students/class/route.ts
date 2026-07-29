import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'
/**
 * Processes a GET request to retrieve the class name and group ID assigned to a student by username.
 *
 * Extracts the `username` query parameter from the request URL and returns the student's class name and groupId in a JSON response. Responds with an error message and appropriate HTTP status code if the username is missing, the student does not exist, or the student has no class assigned.
 *
 * @returns A JSON response containing the class name and groupId, or an error message with the corresponding HTTP status code.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

    const { searchParams } = new URL(request.url)
    const rawUsername = searchParams.get('username')
    if (!rawUsername) {
        return NextResponse.json(
            { error: 'Username parameter is required' },
            { status: 400 }
        )
    }
    const username = normalizeUsername(rawUsername)
    if (!username) {
        return NextResponse.json(
            { error: 'Username parameter is required' },
            { status: 400 }
        )
    }

    const schoolYearIdParam = searchParams.get('schoolYearId')
    const schoolYearId = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined

    try {
        const student = await prisma.student.findUnique({
            where: { username },
            include: { class: true }
        })

        if (!student) {
            console.warn('[username-match] Student not found', { raw: rawUsername, normalized: username })
            return NextResponse.json(
                { error: 'Student not found' },
                { status: 404 }
            )
        }

        if (schoolYearId != null && !Number.isNaN(schoolYearId)) {
            const membership = await prisma.classMembership.findUnique({
                where: { studentId_schoolYearId: { studentId: student.id, schoolYearId } },
                include: { class: true }
            })
            if (membership?.class) {
                return NextResponse.json({
                    class: membership.class.name,
                    groupId: student.groupId
                })
            }
        }

        if (!student.class) {
            return NextResponse.json(
                { error: 'Student has no class assigned' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            class: student.class.name,
            groupId: student.groupId
        })
    } catch (error) {
        captureError(error, {
            location: 'api/students/class',
            type: 'fetch-student-class'
        })
        return NextResponse.json(
            { error: 'Failed to fetch student class' },
            { status: 500 }
        )
    }
} 