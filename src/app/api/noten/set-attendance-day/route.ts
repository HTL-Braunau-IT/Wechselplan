import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'

/**
 * POST: Set Anwesenheit for all students in the group for the given day to "Anwesend".
 * Body: { classId, groupId, schoolYearId, date, period }
 */
export async function POST(request: Request) {
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

		const body = await request.json()
		const { classId, groupId, schoolYearId, date, period } = body as {
			classId?: number
			groupId?: number
			schoolYearId?: number
			date?: string
			period?: string
		}

		if (classId == null || groupId == null || schoolYearId == null || !date || !period) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}
		if (period !== 'AM' && period !== 'PM') {
			return NextResponse.json({ error: 'period must be AM or PM' }, { status: 400 })
		}
		const dateObj = new Date(date)
		if (Number.isNaN(dateObj.getTime())) {
			return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
		}
		const dateOnly = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())

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
		const studentsInGroup = await prisma.student.findMany({
			where: { id: { in: studentIds }, groupId },
			select: { id: true }
		})

		for (const s of studentsInGroup) {
			await prisma.notenEntry.upsert({
				where: {
					studentId_teacherId_classId_groupId_schoolYearId_date_period: {
						studentId: s.id,
						teacherId: teacher.id,
						classId,
						groupId,
						schoolYearId,
						date: dateOnly,
						period
					}
				},
				create: {
					studentId: s.id,
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

		return NextResponse.json({ success: true })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/set-attendance-day',
			type: 'set-attendance-day'
		})
		return NextResponse.json(
			{ error: 'Failed to set attendance' },
			{ status: 500 }
		)
	}
}
