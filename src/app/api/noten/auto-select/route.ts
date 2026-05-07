import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { toLocalDateString } from '@/lib/date-utils'
import { forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

function toWeekStartDate(d: Date | string): Date | null {
	if (d instanceof Date) {
		// DB returns DATE columns as midnight UTC; rebase to local-noon for comparison.
		return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
	}
	const parts = d.split('.')
	if (parts.length !== 3 || parts[0] == null || parts[1] == null || parts[2] == null) return null
	const day = parseInt(parts[0], 10)
	const month = parseInt(parts[1], 10) - 1
	const year = parseInt(parts[2], 10)
	if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null
	if (year < 100) return new Date(2000 + year, month, day)
	return new Date(year, month, day)
}

/** Parse YYYY-MM-DD as local date at noon (for comparisons). */
function parseLocalDate(ymd: string): Date {
	const parts = ymd.split('-').map(Number)
	const y = parts[0] ?? Number.NaN
	const m = parts[1] ?? Number.NaN
	const d = parts[2] ?? Number.NaN
	if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return new Date(0)
	return new Date(y, m - 1, d, 12, 0, 0)
}

/** True if todayYmd (YYYY-MM-DD) falls in the week starting weekStart (Monday). Matches teacher overview isWithinInterval logic. */
function isDateInWeek(todayYmd: string, weekStart: Date): boolean {
	const today = parseLocalDate(todayYmd)
	const weekEnd = new Date(weekStart)
	weekEnd.setDate(weekStart.getDate() + 7)
	return today >= weekStart && today < weekEnd
}

/**
 * Find the first turn (in order) whose weeks contain todayYmd. Returns turn id or null.
 * Mirrors teacher overview getCurrentWeek(turns).
 */
function getCurrentTurnId(
	turns: Array<{ id: number; weeks: Array<{ date: Date | string; isHoliday: boolean }> }>,
	todayYmd: string
): number | null {
	for (const turn of turns) {
		for (const week of turn.weeks) {
			if (week.isHoliday) continue
			const weekStart = toWeekStartDate(week.date)
			if (!weekStart) continue
			if (isDateInWeek(todayYmd, weekStart)) return turn.id
		}
	}
	return null
}

/**
 * GET: Returns { classId, groupId } for the "current" slot based on server date/time, or null.
 * Uses TeacherRotation + schedule to find which class+group the teacher has today at current period.
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
		const dateParam = searchParams.get('date')
		const periodParam = searchParams.get('period')
		const classIdParam = searchParams.get('classId')
		const selectedWeekdayParam = searchParams.get('selectedWeekday')
		const parsedSelectedWeekday =
			selectedWeekdayParam != null ? parseInt(selectedWeekdayParam, 10) : Number.NaN
		const hasParsedSelectedWeekday =
			!Number.isNaN(parsedSelectedWeekday) &&
			parsedSelectedWeekday >= 1 &&
			parsedSelectedWeekday <= 5
		const now = new Date()
		let schoolYearId: number | undefined = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
		if (schoolYearId == null || Number.isNaN(schoolYearId)) {
			const current = await prisma.schoolYear.findFirst({
				where: { startDate: { lte: now }, endDate: { gte: now } },
				select: { id: true }
			})
			schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
		}
		if (schoolYearId == null) {
			return ok({ classId: null, groupId: null })
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return ok({ classId: null, groupId: null })
		}

		// Use client-provided date/period when given so timezone matches the user (e.g. noten page in Austria, server in UTC)
		const todayLocal =
			dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : toLocalDateString(now)
		const period =
			periodParam === 'AM' || periodParam === 'PM' ? periodParam : now.getHours() < 12 ? 'AM' : 'PM'
		const currentWeekday =
			hasParsedSelectedWeekday
				? parsedSelectedWeekday
				: dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
					? new Date(dateParam + 'T12:00:00').getDay()
					: now.getDay()

		// When classId is provided: return groupId for that class's current turn (week-based), regardless of today's weekday
		const requestedClassId = classIdParam != null ? parseInt(classIdParam, 10) : NaN
		const requestedSelectedWeekday = parsedSelectedWeekday
		const hasRequestedSelectedWeekday = hasParsedSelectedWeekday
		const requestedPeriod =
			periodParam === 'AM' || periodParam === 'PM' ? periodParam : null
		if (!Number.isNaN(requestedClassId)) {
			const classAssignments = await prisma.teacherAssignment.findMany({
				where: { teacherId: teacher.id, schoolYearId, classId: requestedClassId },
				select: { classId: true, groupId: true, selectedWeekday: true, period: true }
			})
			if (classAssignments.length === 0) {
				return ok({ classId: requestedClassId, groupId: null })
			}
			const firstAssignment = classAssignments[0]
			if (!firstAssignment) {
				return ok({ classId: requestedClassId, groupId: null })
			}
			const filteredAssignments = classAssignments.filter((assignment) => {
				if (hasRequestedSelectedWeekday && assignment.selectedWeekday !== requestedSelectedWeekday) {
					return false
				}
				if (requestedPeriod && assignment.period !== requestedPeriod) {
					return false
				}
				return true
			})
			const targetAssignments = filteredAssignments.length > 0 ? filteredAssignments : classAssignments
			const targetAssignment = targetAssignments[0]
			if (!targetAssignment) {
				return ok({ classId: requestedClassId, groupId: null })
			}
			const schedule = await prisma.schedule.findFirst({
				where: {
					classId: requestedClassId,
					schoolYearId,
					selectedWeekday: targetAssignment.selectedWeekday
				},
				orderBy: { createdAt: 'desc' },
				include: {
					turns: { include: { weeks: true }, orderBy: { order: 'asc' } }
				}
			})
			const rotations = await prisma.teacherRotation.findMany({
				where: {
					teacherId: teacher.id,
					classId: requestedClassId,
					schoolYearId,
					selectedWeekday: targetAssignment.selectedWeekday
				}
			})
			if (schedule?.turns?.length) {
				const turnsForCurrentTurn = schedule.turns.map((t) => ({
					id: t.id,
					weeks: t.weeks.map((w) => ({ date: w.date, isHoliday: w.isHoliday }))
				}))
				const currentTurnId = getCurrentTurnId(turnsForCurrentTurn, todayLocal)
				if (currentTurnId != null) {
					const rot = rotations.find(
						(r) =>
							r.classId === requestedClassId &&
							r.selectedWeekday === targetAssignment.selectedWeekday &&
							r.period === targetAssignment.period &&
							r.turnId === currentTurnId &&
							r.teacherId === teacher.id
					)
					if (rot && classAssignments.some((a) => a.groupId === rot.groupId)) {
						return ok({ classId: requestedClassId, groupId: rot.groupId })
					}
				}
			}
			return ok({
				classId: requestedClassId,
				groupId: targetAssignment.groupId
			})
		}

		const assignments = await prisma.teacherAssignment.findMany({
			where: { teacherId: teacher.id, schoolYearId },
			select: { classId: true, groupId: true, selectedWeekday: true, period: true }
		})
		const rotations = await prisma.teacherRotation.findMany({
			where: {
				teacherId: teacher.id,
				schoolYearId,
				selectedWeekday: currentWeekday
			}
		})

		const classIds = [...new Set(assignments.map((a) => a.classId))]
		const schedules = await prisma.schedule.findMany({
			where: { classId: { in: classIds }, schoolYearId, selectedWeekday: currentWeekday },
			orderBy: { createdAt: 'desc' },
			include: {
				turns: { include: { weeks: true }, orderBy: { order: 'asc' } }
			}
		})
		const scheduleByClass = new Map<number, (typeof schedules)[0]>()
		for (const s of schedules) {
			if (s.classId && !scheduleByClass.has(s.classId)) scheduleByClass.set(s.classId, s)
		}

		// Same logic as teacher overview: find current turn by "week contains today", then resolve group from teacherRotation
		if (currentWeekday >= 1 && currentWeekday <= 5) {
			const periodAssignments = assignments.filter(
				(a) => a.selectedWeekday === currentWeekday && a.period === period
			)
			for (const a of periodAssignments) {
				const schedule = scheduleByClass.get(a.classId)
				if (!schedule?.turns?.length) continue
				const turnsForCurrentTurn = schedule.turns.map((t) => ({
					id: t.id,
					weeks: t.weeks.map((w) => ({ date: w.date, isHoliday: w.isHoliday }))
				}))
				const currentTurnId = getCurrentTurnId(turnsForCurrentTurn, todayLocal)
				if (currentTurnId == null) continue
				const rot = rotations.find(
					(r) =>
						r.classId === a.classId &&
						r.selectedWeekday === currentWeekday &&
						r.period === period &&
						r.turnId === currentTurnId &&
						r.teacherId === teacher.id
				)
				if (rot && assignments.some((as) => as.classId === rot.classId && as.groupId === rot.groupId)) {
					return ok({ classId: rot.classId, groupId: rot.groupId })
				}
			}
			const firstAssignment = periodAssignments[0]
			if (firstAssignment) {
				return ok({ classId: firstAssignment.classId, groupId: firstAssignment.groupId })
			}
		}

		return ok({ classId: null, groupId: null })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/auto-select',
			type: 'auto-select'
		})
		return serverError('Failed to auto-select')
	}
}
