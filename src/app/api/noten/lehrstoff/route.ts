import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

/**
 * PATCH: Upsert Lehrstoff for a single day (teacher, class, group, date, period).
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
		const { classId, groupId, schoolYearId, date, period, lehrstoff } = body as {
			classId?: number
			groupId?: number
			schoolYearId?: number
			date?: string
			period?: string
			lehrstoff?: string
		}

		if (classId == null || groupId == null || schoolYearId == null || !date || !period) {
			return badRequest('Missing required fields')
		}
		if (period !== 'AM' && period !== 'PM') {
			return badRequest('period must be AM or PM')
		}
		const dateOnly = new Date(date + 'T00:00:00.000Z')
		if (Number.isNaN(dateOnly.getTime())) {
			return badRequest('Invalid date')
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return forbidden('Teacher not found')
		}

		const isAssignedToClass = await prisma.teacherAssignment.findFirst({
			where: { teacherId: teacher.id, classId, schoolYearId }
		})
		if (!isAssignedToClass) {
			return forbidden('Not assigned to this class')
		}

		await prisma.lehrstoffPerDay.upsert({
			where: {
				teacherId_classId_groupId_schoolYearId_date_period: {
					teacherId: teacher.id,
					classId,
					groupId,
					schoolYearId,
					date: dateOnly,
					period
				}
			},
			create: {
				teacherId: teacher.id,
				classId,
				groupId,
				schoolYearId,
				date: dateOnly,
				period,
				lehrstoff: lehrstoff ?? null
			},
			update: { lehrstoff: lehrstoff ?? null }
		})

		return ok({ success: true })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/lehrstoff',
			type: 'save-lehrstoff'
		})
		return serverError('Failed to save Lehrstoff')
	}
}
