import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * GET: Returns students in the given class (and optionally group). If groupId is omitted, returns all students in the class (all groups).
 * Only if current teacher is assigned to that class.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

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
		const classIdParam = searchParams.get('classId')
		const groupIdParam = searchParams.get('groupId')
		const schoolYearIdParam = searchParams.get('schoolYearId')

		if (!classIdParam) {
			return NextResponse.json({ error: 'classId required' }, { status: 400 })
		}
		const classId = parseInt(classIdParam, 10)
		const groupId = groupIdParam !== null && groupIdParam !== '' ? parseInt(groupIdParam, 10) : null
		if (Number.isNaN(classId) || (groupId !== null && Number.isNaN(groupId))) {
			return NextResponse.json({ error: 'Invalid classId or groupId' }, { status: 400 })
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
			return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
		}

		const isAssignedToClass = await prisma.teacherAssignment.findFirst({
			where: { teacherId: teacher.id, classId, schoolYearId }
		})
		if (!isAssignedToClass) {
			return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
		}

		const membershipIds = await prisma.classMembership.findMany({
			where: { classId, schoolYearId },
			select: { studentId: true }
		})
		const studentIds = membershipIds.map((m) => m.studentId)
		if (studentIds.length === 0) {
			return NextResponse.json({ students: [] })
		}

		// Grade entry student picker: only show active students. Historical grades
		// still look up by studentId directly (no filter), so past records stay visible.
		const students = await prisma.student.findMany({
			where: {
				id: { in: studentIds },
				isActive: true,
				...(groupId !== null ? { groupId } : {})
			},
			select: { id: true, firstName: true, lastName: true, groupId: true, sitzplatz: true },
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		})

		return NextResponse.json({ students })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/students',
			type: 'fetch-students'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch students' },
			{ status: 500 }
		)
	}
}
