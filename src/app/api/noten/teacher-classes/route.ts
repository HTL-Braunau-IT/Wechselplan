import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

/**
 * GET: Returns classes the current teacher is assigned to, each with all group IDs for that class
 * (from any teacher's assignment in the school year). Used for class and group tabs on the Noten page.
 */
export async function GET(request: Request) {
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

		const { searchParams } = new URL(request.url)
		const schoolYearIdParam = searchParams.get('schoolYearId')
		let schoolYearId: number | undefined = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
		if (schoolYearId == null || Number.isNaN(schoolYearId)) {
			const now = new Date()
			const current = await prisma.schoolYear.findFirst({
				where: { startDate: { lte: now }, endDate: { gte: now } },
				select: { id: true }
			})
			schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
		}
		if (schoolYearId == null) {
			return badRequest('No school year found.')
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({
			where: { username }
		})

		if (!teacher) {
			return ok({ classes: [] })
		}

		const myAssignments = await prisma.teacherAssignment.findMany({
			where: { teacherId: teacher.id, schoolYearId },
			select: { classId: true, groupId: true, selectedWeekday: true, period: true }
		})
		const classIds = [...new Set(myAssignments.map((a) => a.classId))]
		if (classIds.length === 0) {
			return ok({ classes: [] })
		}

		// Class-wide groups for tabs: all groups that exist in this class for the school year.
		const allAssignments = await prisma.teacherAssignment.findMany({
			where: { classId: { in: classIds }, schoolYearId },
			select: { classId: true, groupId: true, selectedWeekday: true }
		})
		const byClass = new Map<number, Set<number>>()
		const byClassAndWeekday = new Map<string, Set<number>>()
		for (const a of allAssignments) {
			if (!byClass.has(a.classId)) byClass.set(a.classId, new Set())
			byClass.get(a.classId)!.add(a.groupId)
			const classWeekdayKey = `${a.classId}-${a.selectedWeekday}`
			if (!byClassAndWeekday.has(classWeekdayKey)) byClassAndWeekday.set(classWeekdayKey, new Set())
			byClassAndWeekday.get(classWeekdayKey)!.add(a.groupId)
		}

		const classRecords = await prisma.class.findMany({
			where: { id: { in: classIds } },
			select: { id: true, name: true },
			orderBy: { name: 'asc' }
		})

		const classes = classRecords.map((cls) => {
			const slotsMap = new Map<string, { selectedWeekday: number; period: string; groupId: number }>()
			const teacherWeekdays = new Set<number>()
			for (const assignment of myAssignments) {
				if (assignment.classId !== cls.id) continue
				const key = `${assignment.selectedWeekday}-${assignment.period}-${assignment.groupId}`
				if (!slotsMap.has(key)) {
					slotsMap.set(key, {
						selectedWeekday: assignment.selectedWeekday,
						period: assignment.period,
						groupId: assignment.groupId
					})
				}
				teacherWeekdays.add(assignment.selectedWeekday)
			}
			const teachingGroupsByWeekdayEntries = Array.from(teacherWeekdays)
				.sort((a, b) => a - b)
				.map((weekday) => {
					const classWeekdayKey = `${cls.id}-${weekday}`
					const groupIds = Array.from(byClassAndWeekday.get(classWeekdayKey) ?? []).sort((a, b) => a - b)
					return [String(weekday), groupIds] as const
				})
			const teachingGroupsByWeekday = Object.fromEntries(
				teachingGroupsByWeekdayEntries
			)
			return {
				id: cls.id,
				name: cls.name,
				groupIds: Array.from(byClass.get(cls.id) ?? []).sort((a, b) => a - b),
				teachingGroupsByWeekday,
				teachingSlots: Array.from(slotsMap.values()).sort((a, b) => {
					const weekdayDiff = a.selectedWeekday - b.selectedWeekday
					if (weekdayDiff !== 0) return weekdayDiff
					if (a.period === b.period) return 0
					return a.period === 'AM' ? -1 : 1
				})
			}
		})

		return ok({ classes })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/teacher-classes',
			type: 'fetch-teacher-classes'
		})
		return serverError('Failed to fetch teacher classes')
	}
}
