import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'
import { toLocalDateString } from '@/lib/date-utils'
import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

type TeachingDay = { date: string; period: string }

function parseDateString(d: string): Date | null {
	const parts = d.split('.')
	if (parts.length !== 3 || parts[0] == null || parts[1] == null || parts[2] == null) return null
	const day = parseInt(parts[0], 10)
	const month = parseInt(parts[1], 10) - 1
	const year = parseInt(parts[2], 10)
	if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null
	if (year < 100) return new Date(2000 + year, month, day)
	return new Date(year, month, day)
}

/**
 * GET: Returns array of { date, period } for which the current teacher has this class+group.
 * Uses TeacherRotation + schedule turns/weeks; excludes holidays.
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
		const classIdParam = searchParams.get('classId')
		const groupIdParam = searchParams.get('groupId')
		const schoolYearIdParam = searchParams.get('schoolYearId')
		const selectedWeekdayParam = searchParams.get('selectedWeekday')

		if (!classIdParam || !groupIdParam) {
			return badRequest('classId and groupId required')
		}
		const classId = parseInt(classIdParam, 10)
		const groupId = parseInt(groupIdParam, 10)
		if (Number.isNaN(classId) || Number.isNaN(groupId)) {
			return badRequest('Invalid classId or groupId')
		}
		const selectedWeekday =
			selectedWeekdayParam != null && selectedWeekdayParam !== ''
				? parseInt(selectedWeekdayParam, 10)
				: null
		if (
			selectedWeekdayParam != null &&
			(selectedWeekday == null || Number.isNaN(selectedWeekday) || selectedWeekday < 1 || selectedWeekday > 5)
		) {
			return badRequest('selectedWeekday must be between 1 and 5')
		}

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

		const teacherAssignmentsForGroup = await prisma.teacherAssignment.findMany({
			where: {
				teacherId: teacher.id,
				classId,
				groupId,
				schoolYearId,
				...(selectedWeekday != null && { selectedWeekday })
			},
			select: { selectedWeekday: true, period: true }
		})
		if (teacherAssignmentsForGroup.length === 0) {
			return ok({ teachingDays: [] })
		}

		const rotations = await prisma.teacherRotation.findMany({
			where: {
				teacherId: teacher.id,
				classId,
				groupId,
				schoolYearId,
				...(selectedWeekday != null && { selectedWeekday })
			},
			include: { turn: { select: { name: true } } }
		})
		const fallbackAssignments =
			rotations.length === 0
				? teacherAssignmentsForGroup
				: []
		if (rotations.length === 0 && fallbackAssignments.length === 0) {
			return ok({ teachingDays: [] })
		}

		const schedules = await prisma.schedule.findMany({
			where: { classId, schoolYearId },
			orderBy: { createdAt: 'desc' },
			include: {
				turns: {
					include: { weeks: true },
					orderBy: { order: 'asc' }
				}
			}
		})
		const scheduleByWeekday = new Map<number, typeof schedules[number]>()
		for (const s of schedules) {
			if (!scheduleByWeekday.has(s.selectedWeekday)) {
				scheduleByWeekday.set(s.selectedWeekday, s)
			}
		}
		const latestSchedule = schedules[0]

		const teachingDays: TeachingDay[] = []
		const seen = new Set<string>()
		if (rotations.length > 0) {
			for (const rot of rotations) {
				const scheduleForWeekday = scheduleByWeekday.get(rot.selectedWeekday) ?? latestSchedule
				if (!scheduleForWeekday?.turns?.length) continue
				const turnsData = normalizeToJsonFormat(scheduleForWeekday.turns) as Record<string, { weeks: Array<{ date: string; isHoliday: boolean }> }>
				const turnData = turnsData[rot.turn.name]
				if (!turnData?.weeks) continue
				for (const week of turnData.weeks) {
					if (week.isHoliday) continue
					const dateObj = parseDateString(week.date)
					if (!dateObj) continue
					const key = `${toLocalDateString(dateObj)}-${rot.period}`
					if (seen.has(key)) continue
					seen.add(key)
					teachingDays.push({ date: toLocalDateString(dateObj), period: rot.period })
				}
			}
		} else {
			// Fallback for newly created classes without TeacherRotation rows yet:
			// derive dates from the class schedule(s) of weekdays where the teacher is assigned.
			for (const assignment of fallbackAssignments) {
				const scheduleForWeekday =
					scheduleByWeekday.get(assignment.selectedWeekday) ?? latestSchedule
				if (!scheduleForWeekday?.turns?.length) continue
				const turnsData = normalizeToJsonFormat(scheduleForWeekday.turns) as Record<string, { weeks: Array<{ date: string; isHoliday: boolean }> }>
				for (const turnData of Object.values(turnsData)) {
					for (const week of turnData.weeks) {
						if (week.isHoliday) continue
						const dateObj = parseDateString(week.date)
						if (!dateObj) continue
						const key = `${toLocalDateString(dateObj)}-${assignment.period}`
						if (seen.has(key)) continue
						seen.add(key)
						teachingDays.push({ date: toLocalDateString(dateObj), period: assignment.period })
					}
				}
			}
		}
		teachingDays.sort((a, b) => {
			const d = a.date.localeCompare(b.date)
			if (d !== 0) return d
			return a.period === 'AM' && b.period === 'PM' ? -1 : a.period === 'PM' && b.period === 'AM' ? 1 : 0
		})

		// When same date has both AM and PM (same group), keep only one day per date (prefer AM)
		const seenDates = new Set<string>()
		const teachingDaysOnePerDate = teachingDays.filter((day) => {
			if (seenDates.has(day.date)) return false
			seenDates.add(day.date)
			return true
		})

		return ok({ teachingDays: teachingDaysOnePerDate })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/teaching-days',
			type: 'fetch-teaching-days'
		})
		return serverError('Failed to fetch teaching days')
	}
}
