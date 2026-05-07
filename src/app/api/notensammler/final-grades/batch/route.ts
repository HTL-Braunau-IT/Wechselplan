import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { badRequest, forbidden, notFound, ok, serverError, unauthorized } from '@/lib/api-response'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_FINAL_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]
const ALLOWED_CONDUCT_NOTE_WISH = [
	'Sehr zufriedenstellend',
	'Zufriedenstellend',
	'Wenig Zufriedenstellend',
	'Nicht zufriedenstellend'
] as const
const MAX_FINAL_GRADES_BATCH = 100

type FinalGradeEntry = {
	studentId: number
	semester: 'first' | 'second'
	grade: number | null
	conductNoteWish: string | null
}

/**
 * Handles POST requests to save or update multiple final grades in one transaction.
 * Body: { classId, schoolYearId?, finalGrades: Array<{ studentId, semester, grade?, conductNoteWish? }> }
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
			finalGrades: Array<{
				studentId: unknown
				semester: unknown
				grade?: unknown
				conductNoteWish?: string | null
			}>
		}
		requestData = body
		const { classId, schoolYearId: bodySchoolYearId, finalGrades: rawFinalGrades } = body

		if (!rawFinalGrades || !Array.isArray(rawFinalGrades)) {
			return badRequest('finalGrades must be an array')
		}
		if (rawFinalGrades.length > MAX_FINAL_GRADES_BATCH) {
			return badRequest(`Too many final grades. Maximum ${MAX_FINAL_GRADES_BATCH} per request.`)
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

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return forbidden('Teacher not found')
		}

		// Parse and validate each entry
		const finalGrades: FinalGradeEntry[] = []
		for (let i = 0; i < rawFinalGrades.length; i++) {
			const fg = rawFinalGrades[i]!
			const studentId = typeof fg.studentId === 'string' ? parseInt(fg.studentId, 10) : typeof fg.studentId === 'number' ? fg.studentId : NaN
			if (isNaN(studentId)) {
				return badRequest(`Invalid studentId at index ${i}`)
			}
			if (fg.semester !== 'first' && fg.semester !== 'second') {
				return badRequest(`Semester must be "first" or "second" at index ${i}`)
			}
			let gradeValue: number | null = null
			if (fg.grade !== null && fg.grade !== undefined) {
				const num = typeof fg.grade === 'string' ? parseFloat(fg.grade) : typeof fg.grade === 'number' ? fg.grade : NaN
				if (isNaN(num) || !ALLOWED_FINAL_GRADES.includes(num)) {
					return badRequest(`Final grade must be one of: ${ALLOWED_FINAL_GRADES.join(', ')} or null at index ${i}`)
				}
				gradeValue = num
			}
			let conductNoteWishValue: string | null = null
			if (fg.conductNoteWish !== undefined && fg.conductNoteWish !== null && fg.conductNoteWish !== '') {
				if (ALLOWED_CONDUCT_NOTE_WISH.includes(fg.conductNoteWish as (typeof ALLOWED_CONDUCT_NOTE_WISH)[number])) {
					conductNoteWishValue = fg.conductNoteWish
				} else {
					return badRequest(`conductNoteWish must be one of: ${ALLOWED_CONDUCT_NOTE_WISH.join(', ')} or null at index ${i}`)
				}
			}
			finalGrades.push({
				studentId,
				semester: fg.semester as 'first' | 'second',
				grade: gradeValue,
				conductNoteWish: conductNoteWishValue
			})
		}

		const finalGradeOps = finalGrades.map((fg) =>
			prisma.finalGrade.upsert({
				where: {
					studentId_classId_semester_schoolYearId: {
						studentId: fg.studentId,
						classId: classIdNum,
						semester: fg.semester,
						schoolYearId
					}
				},
				update: {
					grade: fg.grade,
					conductNoteWish: fg.conductNoteWish
				},
				create: {
					studentId: fg.studentId,
					classId: classIdNum,
					semester: fg.semester,
					schoolYearId,
					grade: fg.grade,
					conductNoteWish: fg.conductNoteWish
				}
			})
		)
		const gradeOps = finalGrades
			.filter((fg) => fg.grade != null)
			.map((fg) =>
				prisma.grade.upsert({
					where: {
						studentId_teacherId_classId_semester_schoolYearId: {
							studentId: fg.studentId,
							teacherId: teacher.id,
							classId: classIdNum,
							semester: fg.semester,
							schoolYearId
						}
					},
					update: { grade: fg.grade },
					create: {
						studentId: fg.studentId,
						teacherId: teacher.id,
						classId: classIdNum,
						semester: fg.semester,
						schoolYearId,
						grade: fg.grade!
					}
				})
			)
		await prisma.$transaction([...finalGradeOps, ...gradeOps])

		return ok({ success: true, count: finalGrades.length })
	} catch (error) {
		captureError(error as Error, {
			location: 'api/notensammler/final-grades/batch',
			type: 'save-final-grades-batch',
			extra: {
				requestData,
				errorMessage: error instanceof Error ? error.message : String(error)
			}
		})
		return serverError('Failed to save final grades', { details: error instanceof Error ? error.message : String(error) })
	}
}
