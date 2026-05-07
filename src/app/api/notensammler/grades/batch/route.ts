import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/api-response'

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
			return unauthorized('Unauthorized')
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return forbidden('Forbidden')
		}
		if (!(await isFeatureEnabled('notensammler'))) {
			return forbidden('Feature not available')
		}

		const body = (await request.json()) as {
			classId: unknown
			schoolYearId?: number
			grades: Array<{ studentId: unknown; teacherId: unknown; semester: unknown; grade: unknown }>
		}
		requestData = body
		const { classId, schoolYearId: bodySchoolYearId, grades: rawGrades } = body

		if (!rawGrades || !Array.isArray(rawGrades)) {
			return badRequest('grades must be a non-empty array')
		}
		if (rawGrades.length > MAX_GRADES_BATCH) {
			return badRequest(`Too many grades. Maximum ${MAX_GRADES_BATCH} per request.`)
		}

		const classIdNum =
			typeof classId === 'string' ? parseInt(classId, 10) : typeof classId === 'number' ? classId : NaN
		if (isNaN(classIdNum)) {
			return badRequest('Invalid classId')
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
			return badRequest('No school year found. Create a school year in Admin / Data / School Years first.')
		}

		// Verify class exists
		const classRecord = await prisma.class.findUnique({
			where: { id: classIdNum }
		})
		if (!classRecord) {
			return notFound('Class not found')
		}

		// Parse and validate each entry
		const grades: GradeEntry[] = []
		for (let i = 0; i < rawGrades.length; i++) {
			const g = rawGrades[i]!
			const studentId = typeof g.studentId === 'string' ? parseInt(g.studentId, 10) : typeof g.studentId === 'number' ? g.studentId : NaN
			const teacherId = typeof g.teacherId === 'string' ? parseInt(g.teacherId, 10) : typeof g.teacherId === 'number' ? g.teacherId : NaN
			if (isNaN(studentId) || isNaN(teacherId)) {
				return badRequest(`Invalid studentId or teacherId at index ${i}`)
			}
			if (g.semester !== 'first' && g.semester !== 'second') {
				return badRequest(`Semester must be "first" or "second" at index ${i}`)
			}
			let gradeValue: number | null = null
			if (g.grade !== null && g.grade !== undefined) {
				const num = typeof g.grade === 'string' ? parseFloat(g.grade) : typeof g.grade === 'number' ? g.grade : NaN
				if (isNaN(num) || !ALLOWED_GRADES.includes(num)) {
					return badRequest(`Grade must be one of: ${ALLOWED_GRADES.join(', ')} or null at index ${i}`)
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

		return ok({ success: true, count: grades.length })
	} catch (error) {
		captureError(error as Error, {
			location: 'api/notensammler/grades/batch',
			type: 'save-grades-batch',
			extra: {
				requestData,
				errorMessage: error instanceof Error ? error.message : String(error)
			}
		})
		return serverError('Failed to save grades', { details: error instanceof Error ? error.message : String(error) })
	}
}
