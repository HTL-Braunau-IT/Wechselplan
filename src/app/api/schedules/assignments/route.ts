import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { badRequest, notFound, ok, serverError } from '@/lib/api-response'

interface Assignment {
	groupId: number
	studentIds: number[]
}

interface RequestBody {
	classId: number
	assignments: Assignment[]
	removedStudentIds?: number[]
	/** 1–5 (Mo–Fr). Required for writes; optional on reads (defaults to 1). */
	weekday?: number
	schoolYearId?: number
}

async function resolveSchoolYearId(param: string | null): Promise<number | undefined> {
	let schoolYearId = param ? parseInt(param, 10) : undefined
	if (schoolYearId == null || Number.isNaN(schoolYearId)) {
		const now = new Date()
		const current = await prisma.schoolYear.findFirst({
			where: { startDate: { lte: now }, endDate: { gte: now } },
			select: { id: true }
		})
		schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
	}
	return schoolYearId ?? undefined
}

/**
 * Retrieves group assignments and unassigned students for a specified class and weekday (school year scoped).
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const classIdParam = searchParams.get('classId')
		const weekdayParam = searchParams.get('weekday')
		const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))

		if (!classIdParam) {
			return badRequest('Class ID parameter is required')
		}

		const classId = parseInt(classIdParam, 10)
		if (isNaN(classId)) {
			return badRequest('Class ID must be a number')
		}

		const weekday =
			weekdayParam != null && weekdayParam !== ''
				? parseInt(weekdayParam, 10)
				: 1
		if (isNaN(weekday) || weekday < 1 || weekday > 5) {
			return badRequest('weekday must be between 1 and 5')
		}

		if (schoolYearId == null) {
			return badRequest('No school year found.')
		}

		const classRecord = await prisma.class.findUnique({
			where: { id: classId }
		})

		if (!classRecord) {
			return notFound('Class not found')
		}

		const classMembershipsForYear = await prisma.classMembership.findMany({
			where: { classId: classRecord.id, schoolYearId },
			select: { studentId: true }
		})
		const memberStudentIds = classMembershipsForYear.map(m => m.studentId)
		const students = memberStudentIds.length > 0
			? await prisma.student.findMany({
					where: { id: { in: memberStudentIds } },
					orderBy: [
						{ lastName: 'asc' },
						{ firstName: 'asc' }
					]
				})
			: []

		const studentIds = students.map(s => s.id)
		const weekdayMemberships =
			studentIds.length > 0
				? await prisma.studentWeekdayGroup.findMany({
						where: {
							studentId: { in: studentIds },
							schoolYearId,
							weekday
						}
					})
				: []

		const membershipByStudent = new Map<number, number>()
		for (const m of weekdayMemberships) {
			membershipByStudent.set(m.studentId, m.groupId)
		}

		function effectiveGroupId(studentId: number): number | null {
			const fromDay = membershipByStudent.get(studentId)
			return fromDay !== undefined && fromDay !== 0 ? fromDay : null
		}

		const groups = new Map<number, typeof students>()
		for (const student of students) {
			const gid = effectiveGroupId(student.id)
			if (gid != null && gid !== 0) {
				if (!groups.has(gid)) {
					groups.set(gid, [])
				}
				groups.get(gid)!.push(student)
			}
		}

		const groupsFromAssignments = await prisma.teacherAssignment.findMany({
			where: { classId: classRecord.id, schoolYearId, selectedWeekday: weekday },
			select: { groupId: true },
			distinct: ['groupId'],
			orderBy: { groupId: 'asc' }
		})
		const allGroupIds = Array.from(
			new Set([
				...Array.from(groups.keys()),
				...groupsFromAssignments.map((row) => row.groupId)
			])
		).sort((a, b) => a - b)
		const assignments: Assignment[] = allGroupIds.map((groupId) => ({
			groupId,
			studentIds: groups.get(groupId)?.map((s: { id: number }) => s.id) ?? []
		}))

		const unassignedStudents = students.filter((s) => effectiveGroupId(s.id) == null)

		return ok({
			assignments,
			unassignedStudents,
			weekday,
			schoolYearId
		})
	} catch (error) {
		captureError(error, {
			location: 'api/schedules/assignments',
			type: 'fetch-assignments',
			extra: {
				searchParams: Object.fromEntries(new URL(request.url).searchParams)
			}
		})
		return serverError('Failed to fetch assignments')
	}
}

/**
 * Updates student group assignments for one weekday.
 */
export async function POST(request: Request) {
	let rawBody = ''
	try {
		rawBody = await request.text()
		let body: RequestBody
		try {
			body = JSON.parse(rawBody)
		} catch {
			captureError(new Error('Invalid request body'), {
				location: 'api/schedules/assignments',
				type: 'validation-error',
				extra: { requestBody: rawBody }
			})
			return badRequest('Invalid request body')
		}

		const { classId, assignments, removedStudentIds, weekday: bodyWeekday, schoolYearId: bodySchoolYearId } = body

		if (!classId || typeof classId !== 'number') {
			return badRequest('Class ID parameter is required')
		}

		const weekday =
			typeof bodyWeekday === 'number' && bodyWeekday >= 1 && bodyWeekday <= 5 ? bodyWeekday : null
		if (weekday == null) {
			return badRequest('weekday is required and must be 1–5')
		}

		let schoolYearId = typeof bodySchoolYearId === 'number' ? bodySchoolYearId : undefined
		if (schoolYearId == null) {
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

		if (!Array.isArray(assignments)) {
			return badRequest('Assignments must be an array')
		}

		for (const assignment of assignments) {
			if (!assignment.studentIds) {
				return badRequest('Each assignment must have studentIds')
			}

			if (typeof assignment.groupId !== 'number') {
				return badRequest('groupId must be a number')
			}
		}

		const classRecord = await prisma.class.findUnique({
			where: { id: classId }
		})

		if (!classRecord) {
			return notFound('Class not found')
		}

		for (const assignment of assignments) {
			if (assignment.groupId === 0) {
				await prisma.studentWeekdayGroup.deleteMany({
					where: {
						studentId: { in: assignment.studentIds },
						schoolYearId,
						weekday
					}
				})
			} else {
				for (const sid of assignment.studentIds) {
					await prisma.studentWeekdayGroup.upsert({
						where: {
							studentId_schoolYearId_weekday: {
								studentId: sid,
								schoolYearId,
								weekday
							}
						},
						update: { groupId: assignment.groupId },
						create: {
							studentId: sid,
							schoolYearId,
							weekday,
							groupId: assignment.groupId
						}
					})
				}
			}
		}

		if (Array.isArray(removedStudentIds) && removedStudentIds.length > 0) {
			await prisma.studentWeekdayGroup.deleteMany({
				where: {
					studentId: { in: removedStudentIds },
					schoolYearId,
					weekday
				}
			})
		}

		return ok(null, 'Assignments saved successfully')
	} catch (error) {
		captureError(error, {
			location: 'api/schedules/assignments',
			type: 'create-assignments',
			extra: { requestBody: rawBody }
		})
		return serverError('Failed to create assignments')
	}
}
