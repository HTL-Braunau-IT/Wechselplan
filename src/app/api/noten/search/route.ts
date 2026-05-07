import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { captureError } from '@/lib/sentry'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'
import { toLocalDateString } from '@/lib/date-utils'
import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

type SearchByNameResult = {
	classId: number
	className: string
	groupId: number
	studentId: number
	firstName: string
	lastName: string
}

type SearchByDateResult = {
	classId: number
	className: string
	groupId: number
	period: string
}

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
		const nameQuery = (searchParams.get('nameQuery') ?? '').trim()
		const dateQuery = (searchParams.get('dateQuery') ?? '').trim()

		let schoolYearId: number | undefined = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
		if (schoolYearId == null || Number.isNaN(schoolYearId)) {
			const now = new Date()
			const current = await prisma.schoolYear.findFirst({
				where: { startDate: { lte: now }, endDate: { gte: now } },
				select: { id: true }
			})
			schoolYearId =
				current?.id ??
				(await prisma.schoolYear.findFirst({
					orderBy: { startDate: 'desc' },
					select: { id: true }
				}))?.id
		}
		if (schoolYearId == null) {
			return badRequest('No school year found.')
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return ok({ byName: [], byDate: [] })
		}

		const myAssignments = await prisma.teacherAssignment.findMany({
			where: { teacherId: teacher.id, schoolYearId },
			select: { classId: true }
		})
		const classIds = [...new Set(myAssignments.map((a) => a.classId))]
		if (classIds.length === 0) {
			return ok({ byName: [], byDate: [] })
		}

		const classRecords = await prisma.class.findMany({
			where: { id: { in: classIds } },
			select: { id: true, name: true }
		})
		const classNameById = new Map(classRecords.map((c) => [c.id, c.name]))

		let byName: SearchByNameResult[] = []
		if (nameQuery.length > 0) {
			const memberships = await prisma.classMembership.findMany({
				where: { classId: { in: classIds }, schoolYearId },
				select: { classId: true, studentId: true }
			})
			const studentIds = [...new Set(memberships.map((m) => m.studentId))]
			if (studentIds.length > 0) {
				const lowered = nameQuery.toLowerCase()
				const students = await prisma.student.findMany({
					where: { id: { in: studentIds } },
					select: { id: true, firstName: true, lastName: true },
					orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
				})
				const weekdayGroups = await prisma.studentWeekdayGroup.findMany({
					where: { studentId: { in: studentIds }, schoolYearId },
					select: { studentId: true, groupId: true },
					distinct: ['studentId', 'groupId']
				})
				const groupsByStudent = new Map<number, number[]>()
				for (const row of weekdayGroups) {
					const list = groupsByStudent.get(row.studentId) ?? []
					if (!list.includes(row.groupId)) list.push(row.groupId)
					groupsByStudent.set(row.studentId, list)
				}
				const classIdsByStudent = new Map<number, number[]>()
				for (const m of memberships) {
					const list = classIdsByStudent.get(m.studentId) ?? []
					list.push(m.classId)
					classIdsByStudent.set(m.studentId, list)
				}

				for (const s of students) {
					const fullName = `${s.lastName} ${s.firstName}`.toLowerCase()
					const reverseName = `${s.firstName} ${s.lastName}`.toLowerCase()
					if (!fullName.includes(lowered) && !reverseName.includes(lowered)) continue
					const groupIds = groupsByStudent.get(s.id) ?? []
					if (groupIds.length === 0) continue
					for (const classId of classIdsByStudent.get(s.id) ?? []) {
						for (const groupId of groupIds) {
							byName.push({
								classId,
								className: classNameById.get(classId) ?? `Klasse ${classId}`,
								groupId,
								studentId: s.id,
								firstName: s.firstName,
								lastName: s.lastName
							})
						}
					}
				}
			}
		}

		let byDate: SearchByDateResult[] = []
		if (dateQuery.length > 0) {
			const rotations = await prisma.teacherRotation.findMany({
				where: { teacherId: teacher.id, classId: { in: classIds } },
				select: { classId: true, groupId: true, turnId: true, period: true, turn: { select: { name: true } } }
			})
			const scheduleByClass = new Map<number, Record<string, { weeks: Array<{ date: string; isHoliday: boolean }> }>>()
			for (const classId of classIds) {
				const schedule = await prisma.schedule.findFirst({
					where: { classId, schoolYearId },
					orderBy: { createdAt: 'desc' },
					include: { turns: { include: { weeks: true }, orderBy: { order: 'asc' } } }
				})
				let scheduleData: Record<string, { weeks: Array<{ date: string; isHoliday: boolean }> }> = {}
				if (schedule?.turns && schedule.turns.length > 0) {
					scheduleData = normalizeToJsonFormat(schedule.turns) as Record<string, { weeks: Array<{ date: string; isHoliday: boolean }> }>
				}
				scheduleByClass.set(classId, scheduleData)
			}

			const seen = new Set<string>()
			for (const rot of rotations) {
				const scheduleData = scheduleByClass.get(rot.classId)
				const weeks = scheduleData?.[rot.turn.name]?.weeks ?? []
				for (const week of weeks) {
					if (week.isHoliday) continue
					const dateObj = parseDateString(week.date)
					if (!dateObj) continue
					if (toLocalDateString(dateObj) !== dateQuery) continue
					const key = `${rot.classId}-${rot.groupId}-${rot.period}`
					if (seen.has(key)) continue
					seen.add(key)
					byDate.push({
						classId: rot.classId,
						className: classNameById.get(rot.classId) ?? `Klasse ${rot.classId}`,
						groupId: rot.groupId,
						period: rot.period
					})
				}
			}
			byDate.sort((a, b) => {
				const classCmp = a.className.localeCompare(b.className)
				if (classCmp !== 0) return classCmp
				return a.groupId - b.groupId
			})
		}

		return ok({ byName, byDate })
	} catch (error) {
		captureError(error, { location: 'api/noten/search', type: 'search-noten' })
		return serverError('Failed to search noten data')
	}
}
