import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { normalizeUsername } from '@/lib/username'

/**
 * Handles GET requests to retrieve classes where the current teacher has an assignment,
 * with per-semester grade completion status (allGradesEnteredFirst, allGradesEnteredSecond).
 *
 * @returns A JSON response containing classes array with id, name, allGradesEnteredFirst, allGradesEnteredSecond.
 */
export async function GET() {
	try {
		const session = await getServerSession(authOptions)
		if (!session?.user?.name) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
			where: { teacherId: teacher.id },
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
					prisma.student.count({
						where: {
							classId: cls.id,
							groupId: { not: null }
						}
					}),
					prisma.grade.count({
						where: {
							classId: cls.id,
							teacherId: teacher.id,
							semester: 'first',
							grade: { not: null }
						}
					}),
					prisma.grade.count({
						where: {
							classId: cls.id,
							teacherId: teacher.id,
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
