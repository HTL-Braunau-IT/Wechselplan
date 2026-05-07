import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

/**
 * GET: Returns students in the given class (and optionally group). If groupId is omitted, returns all students in the class (all groups).
 * Only if current teacher is assigned to that class.
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
		const selectedWeekdayParam = searchParams.get('selectedWeekday')
		const schoolYearIdParam = searchParams.get('schoolYearId')

		if (!classIdParam) {
			return badRequest('classId required')
		}
		const classId = parseInt(classIdParam, 10)
		const groupId = groupIdParam !== null && groupIdParam !== '' ? parseInt(groupIdParam, 10) : null
		const selectedWeekday =
			selectedWeekdayParam != null && selectedWeekdayParam !== ''
				? parseInt(selectedWeekdayParam, 10)
				: null
		if (
			Number.isNaN(classId) ||
			(groupId !== null && Number.isNaN(groupId)) ||
			(selectedWeekday != null && (Number.isNaN(selectedWeekday) || selectedWeekday < 1 || selectedWeekday > 5))
		) {
			return badRequest('Invalid classId, groupId or selectedWeekday')
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

		const membershipIds = await prisma.classMembership.findMany({
			where: { classId, schoolYearId },
			select: { studentId: true }
		})
		const studentIds = membershipIds.map((m) => m.studentId)
		if (studentIds.length === 0) {
			return ok({ students: [] })
		}

		const weekdayToUse = selectedWeekday ?? 1
		const weekdayMemberships = await prisma.studentWeekdayGroup.findMany({
			where: {
				studentId: { in: studentIds },
				schoolYearId,
				weekday: weekdayToUse,
				...(groupId !== null ? { groupId } : {})
			},
			select: { studentId: true, groupId: true }
		})
		const membershipByStudent = new Map<number, number>()
		for (const row of weekdayMemberships) {
			membershipByStudent.set(row.studentId, row.groupId)
		}

		const students = await prisma.student.findMany({
			where: {
				id: { in: groupId != null ? weekdayMemberships.map((w) => w.studentId) : studentIds },
				isActive: true
			},
			select: { id: true, firstName: true, lastName: true, sitzplatz: true },
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		})
		const studentsWithGroup = students.map((student) => ({
			...student,
			groupId: membershipByStudent.get(student.id) ?? null
		}))

		return ok({ students: studentsWithGroup })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/students',
			type: 'fetch-students'
		})
		return serverError('Failed to fetch students')
	}
}
