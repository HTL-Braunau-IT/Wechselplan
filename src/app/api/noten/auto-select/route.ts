import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { toLocalDateString } from '@/lib/date-utils'

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

/** Parse YYYY-MM-DD as local date at noon (for comparisons). */
function parseLocalDate(ymd: string): Date {
	const [y, m, d] = ymd.split('-').map(Number)
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
 * Find the first turn (in order) whose weeks contain todayYmd. Returns turn name or null.
 * Mirrors teacher overview getCurrentWeek(turns) -> turn.name.
 */
function getCurrentTurnName(
	turns: Array<{ name: string; weeks: Array<{ date: string; isHoliday: boolean }> }>,
	todayYmd: string
): string | null {
	for (const turn of turns) {
		for (const week of turn.weeks) {
			if (week.isHoliday) continue
			const weekStart = parseDateString(week.date)
			if (!weekStart) continue
			if (isDateInWeek(todayYmd, weekStart)) return turn.name
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
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
		}
		if (!(await isFeatureEnabled('noten'))) {
			return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
		}

		const { searchParams } = new URL(request.url)
		const schoolYearIdParam = searchParams.get('schoolYearId')
		const dateParam = searchParams.get('date')
		const periodParam = searchParams.get('period')
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
			return NextResponse.json({ classId: null, groupId: null })
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return NextResponse.json({ classId: null, groupId: null })
		}

		// Use client-provided date/period when given so timezone matches the user (e.g. noten page in Austria, server in UTC)
		const todayLocal =
			dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : toLocalDateString(now)
		const period =
			periodParam === 'AM' || periodParam === 'PM' ? periodParam : now.getHours() < 12 ? 'AM' : 'PM'
		const currentWeekday =
			dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
				? new Date(dateParam + 'T12:00:00').getDay()
				: now.getDay()

		const assignments = await prisma.teacherAssignment.findMany({
			where: { teacherId: teacher.id, schoolYearId },
			select: { classId: true, groupId: true, selectedWeekday: true, period: true }
		})
		const rotations = await prisma.teacherRotation.findMany({
			where: { teacherId: teacher.id }
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
					name: t.name,
					weeks: t.weeks.map((w) => ({ date: w.date, isHoliday: w.isHoliday }))
				}))
				const currentTurnName = getCurrentTurnName(turnsForCurrentTurn, todayLocal)
				if (!currentTurnName) continue
				const rot = rotations.find(
					(r) =>
						r.classId === a.classId &&
						r.period === period &&
						r.turnId === currentTurnName &&
						r.teacherId === teacher.id
				)
				if (rot && assignments.some((as) => as.classId === rot.classId && as.groupId === rot.groupId)) {
					return NextResponse.json({ classId: rot.classId, groupId: rot.groupId })
				}
			}
			const firstAssignment = periodAssignments[0]
			if (firstAssignment) {
				return NextResponse.json({ classId: firstAssignment.classId, groupId: firstAssignment.groupId })
			}
		}

		return NextResponse.json({ classId: null, groupId: null })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/auto-select',
			type: 'auto-select'
		})
		return NextResponse.json(
			{ error: 'Failed to auto-select' },
			{ status: 500 }
		)
	}
}
