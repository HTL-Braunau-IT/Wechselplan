import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

/**
 * POST: Set Anwesenheit for all students in the group for the given day to "Anwesend".
 * Body: { classId, groupId, schoolYearId, date, period }
 */
export async function POST(request: Request) {
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
		const { classId, groupId, schoolYearId, date, period } = body as {
			classId?: number
			groupId?: number
			schoolYearId?: number
			date?: string
			period?: string
		}

		if (classId == null || groupId == null || schoolYearId == null || !date || !period) {
			return badRequest('Missing required fields')
		}
		if (period !== 'AM' && period !== 'PM') {
			return badRequest('period must be AM or PM')
		}
		const dateObj = new Date(date)
		if (Number.isNaN(dateObj.getTime())) {
			return badRequest('Invalid date')
		}
		const dateOnly = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())

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

		const membershipIds = await prisma.classMembership.findMany({
			where: { classId, schoolYearId },
			select: { studentId: true }
		})
		const studentIds = membershipIds.map((m) => m.studentId)
		const weekdayJs = dateOnly.getDay()
		const weekday = weekdayJs === 0 || weekdayJs === 6 ? 1 : weekdayJs
		const studentsInGroupMembership = await prisma.studentWeekdayGroup.findMany({
			where: {
				studentId: { in: studentIds },
				schoolYearId,
				weekday,
				groupId
			},
			select: { studentId: true }
		})

		for (const s of studentsInGroupMembership) {
			await prisma.notenEntry.upsert({
				where: {
					studentId_teacherId_classId_groupId_schoolYearId_date_period: {
						studentId: s.studentId,
						teacherId: teacher.id,
						classId,
						groupId,
						schoolYearId,
						date: dateOnly,
						period
					}
				},
				create: {
					studentId: s.studentId,
					teacherId: teacher.id,
					classId,
					groupId,
					schoolYearId,
					date: dateOnly,
					period,
					attendance: 'Anwesend'
				},
				update: { attendance: 'Anwesend' }
			})
		}

		return ok({ success: true })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/set-attendance-day',
			type: 'set-attendance-day'
		})
		return serverError('Failed to set attendance')
	}
}
