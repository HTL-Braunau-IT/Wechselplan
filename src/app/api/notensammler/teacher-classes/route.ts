import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { normalizeUsername } from '@/lib/username'

/**
 * Handles GET requests to retrieve classes where the current teacher has an assignment for the given school year,
 * with per-semester grade completion status (allGradesEnteredFirst, allGradesEnteredSecond).
 *
 * @returns A JSON response containing classes array with id, name, allGradesEnteredFirst, allGradesEnteredSecond.
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
			return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({
			where: { username }
		})

		if (!teacher) {
			console.warn('[username-match] Teacher not found (teacher-classes)', { sessionName: session.user.name, normalized: username })
			return NextResponse.json({ classes: [] })
		}

		const assignments = await prisma.teacherAssignment.findMany({
			where: { teacherId: teacher.id, schoolYearId },
			select: { classId: true }
		})

		const distinctClassIds = Array.from(new Set(assignments.map((a) => a.classId)))

		if (distinctClassIds.length === 0) {
			return NextResponse.json({ classes: [] })
		}

		const classRecords = await prisma.class.findMany({
			where: { id: { in: distinctClassIds } },
			select: {
				id: true,
				name: true
			},
			orderBy: { name: 'asc' }
		})

		const result = await Promise.all(
			classRecords.map(async (cls) => {
				const [activeStudentCount, firstCount, secondCount] = await Promise.all([
					prisma.classMembership.count({
						where: {
							classId: cls.id,
							schoolYearId,
							student: { groupId: { not: null } }
						}
					}),
					prisma.grade.count({
						where: {
							classId: cls.id,
							teacherId: teacher.id,
							schoolYearId,
							semester: 'first',
							grade: { not: null }
						}
					}),
					prisma.grade.count({
						where: {
							classId: cls.id,
							teacherId: teacher.id,
							schoolYearId,
							semester: 'second',
							grade: { not: null }
						}
					})
				])

				const allGradesEnteredFirst = activeStudentCount > 0 && firstCount === activeStudentCount
				const allGradesEnteredSecond = activeStudentCount > 0 && secondCount === activeStudentCount

				return {
					id: cls.id,
					name: cls.name,
					allGradesEnteredFirst,
					allGradesEnteredSecond
				}
			})
		)

		return NextResponse.json({ classes: result })
	} catch (error) {
		captureError(error, {
			location: 'api/notensammler/teacher-classes',
			type: 'fetch-teacher-classes'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch teacher classes' },
			{ status: 500 }
		)
	}
}
