import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]
const MAX_GRADES_BATCH = 400

type GradeEntry = {
	studentId: number
	teacherId: number
	semester: 'first' | 'second'
	grade: number | null
}

/**
 * Handles POST requests to save or update multiple grades in one transaction.
 * Body: { classId, schoolYearId?, grades: Array<{ studentId, teacherId, semester, grade }> }
 */
export async function POST(request: Request) {
	let requestData: unknown
	try {
		const session = await getServerSession(authOptions)
		if (!session?.user?.name) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
		}
		if (!(await isFeatureEnabled('notensammler'))) {
			return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
		}

		const body = (await request.json()) as {
			classId: unknown
			schoolYearId?: number
			grades: Array<{ studentId: unknown; teacherId: unknown; semester: unknown; grade: unknown }>
		}
		requestData = body
		const { classId, schoolYearId: bodySchoolYearId, grades: rawGrades } = body

		if (!rawGrades || !Array.isArray(rawGrades)) {
			return NextResponse.json(
				{ error: 'grades must be a non-empty array' },
				{ status: 400 }
			)
		}
		if (rawGrades.length > MAX_GRADES_BATCH) {
			return NextResponse.json(
				{ error: `Too many grades. Maximum ${MAX_GRADES_BATCH} per request.` },
				{ status: 400 }
			)
		}

		const classIdNum =
			typeof classId === 'string' ? parseInt(classId, 10) : typeof classId === 'number' ? classId : NaN
		if (isNaN(classIdNum)) {
			return NextResponse.json({ error: 'Invalid classId' }, { status: 400 })
		}

		// Resolve school year once
		let schoolYearId = bodySchoolYearId
		if (schoolYearId == null) {
			const now = new Date()
			const current = await prisma.schoolYear.findFirst({
				where: { startDate: { lte: now }, endDate: { gte: now } },
				select: { id: true }
			})
			schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
		}
		if (schoolYearId == null) {
			return NextResponse.json(
				{ error: 'No school year found. Create a school year in Admin / Data / School Years first.' },
				{ status: 400 }
			)
		}

		// Verify class exists
		const classRecord = await prisma.class.findUnique({
			where: { id: classIdNum }
		})
		if (!classRecord) {
			return NextResponse.json({ error: 'Class not found' }, { status: 404 })
		}

		// Parse and validate each entry
		const grades: GradeEntry[] = []
		for (let i = 0; i < rawGrades.length; i++) {
			const g = rawGrades[i]!
			const studentId = typeof g.studentId === 'string' ? parseInt(g.studentId, 10) : typeof g.studentId === 'number' ? g.studentId : NaN
			const teacherId = typeof g.teacherId === 'string' ? parseInt(g.teacherId, 10) : typeof g.teacherId === 'number' ? g.teacherId : NaN
			if (isNaN(studentId) || isNaN(teacherId)) {
				return NextResponse.json(
					{ error: `Invalid studentId or teacherId at index ${i}` },
					{ status: 400 }
				)
			}
			if (g.semester !== 'first' && g.semester !== 'second') {
				return NextResponse.json(
					{ error: `Semester must be "first" or "second" at index ${i}` },
					{ status: 400 }
				)
			}
			let gradeValue: number | null = null
			if (g.grade !== null && g.grade !== undefined) {
				const num = typeof g.grade === 'string' ? parseFloat(g.grade) : typeof g.grade === 'number' ? g.grade : NaN
				if (isNaN(num) || !ALLOWED_GRADES.includes(num)) {
					return NextResponse.json(
						{ error: `Grade must be one of: ${ALLOWED_GRADES.join(', ')} or null at index ${i}` },
						{ status: 400 }
					)
				}
				gradeValue = num
			}
			grades.push({
				studentId,
				teacherId,
				semester: g.semester as 'first' | 'second',
				grade: gradeValue
			})
		}

		await prisma.$transaction(
			grades.map((g) =>
				prisma.grade.upsert({
					where: {
						studentId_teacherId_classId_semester_schoolYearId: {
							studentId: g.studentId,
							teacherId: g.teacherId,
							classId: classIdNum,
							semester: g.semester,
							schoolYearId
						}
					},
					update: { grade: g.grade },
					create: {
						studentId: g.studentId,
						teacherId: g.teacherId,
						classId: classIdNum,
						semester: g.semester,
						schoolYearId,
						grade: g.grade
					}
				})
			)
		)

		return NextResponse.json({ success: true, count: grades.length })
	} catch (error) {
		captureError(error as Error, {
			location: 'api/notensammler/grades/batch',
			type: 'save-grades-batch',
			extra: {
				requestData,
				errorMessage: error instanceof Error ? error.message : String(error)
			}
		})
		return NextResponse.json(
			{
				error: 'Failed to save grades',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		)
	}
}
