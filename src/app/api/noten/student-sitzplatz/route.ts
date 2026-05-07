import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/api-response'

/**
 * PATCH: Update student sitzplatz
 * Body: { studentId: number, sitzplatz: string | null }
 */
export async function PATCH(request: Request) {
	try {
		const session = await getServerSession(authOptions)
		if (!session?.user?.name) {
			return unauthorized('Unauthorized')
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return forbidden('Forbidden')
		}
		if (!(await isFeatureEnabled('noten'))) {
			return forbidden('Feature not available')
		}

		const body = await request.json()
		const { studentId, sitzplatz } = body as {
			studentId?: number
			sitzplatz?: string | null
		}

		if (!studentId || typeof studentId !== 'number') {
			return badRequest('studentId required')
		}

		// Verify the teacher has access to update this student
		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return forbidden('Teacher not found')
		}

		// Verify the student exists
		const student = await prisma.student.findUnique({ where: { id: studentId } })
		if (!student) {
			return notFound('Student not found')
		}

		// Update the sitzplatz
		const updated = await prisma.student.update({
			where: { id: studentId },
			data: { sitzplatz: sitzplatz ?? null },
			select: { id: true, firstName: true, lastName: true, sitzplatz: true }
		})

		return ok({ student: { ...updated, groupId: null } })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/student-sitzplatz',
			type: 'update-sitzplatz'
		})
		return serverError('Failed to update sitzplatz')
	}
}
