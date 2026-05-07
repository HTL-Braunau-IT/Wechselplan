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

/**
 * PATCH: Save final grades (Endnote + Betragen) for the noten page when Notensammler feature may be disabled.
 * Body: { classId, schoolYearId?, finalGrades: Array<{ studentId, semester, grade?, conductNoteWish? }> }
 */
export async function PATCH(request: Request) {
	let requestData: unknown
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
			return badRequest('No school year found.')
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return forbidden('Teacher not found')
		}

		const isAssignedToClass = await prisma.teacherAssignment.findFirst({
			where: { teacherId: teacher.id, classId: classIdNum, schoolYearId }
		})
		if (!isAssignedToClass) {
			return forbidden('Not assigned to this class')
		}

		const classRecord = await prisma.class.findUnique({
			where: { id: classIdNum }
		})
		if (!classRecord) {
			return notFound('Class not found')
		}

		for (let i = 0; i < rawFinalGrades.length; i++) {
			const fg = rawFinalGrades[i]!
			const studentId = typeof fg.studentId === 'string' ? parseInt(fg.studentId, 10) : typeof fg.studentId === 'number' ? fg.studentId : NaN
			if (isNaN(studentId)) {
				return badRequest(`Invalid studentId at index ${i}`)
			}
			if (fg.semester !== 'first' && fg.semester !== 'second') {
				return badRequest(`Semester must be "first" or "second" at index ${i}`)
			}
			if (fg.grade !== null && fg.grade !== undefined) {
				const num = typeof fg.grade === 'string' ? parseFloat(fg.grade) : typeof fg.grade === 'number' ? fg.grade : NaN
				if (isNaN(num) || !ALLOWED_FINAL_GRADES.includes(num)) {
					return badRequest(`Final grade must be one of: ${ALLOWED_FINAL_GRADES.join(', ')} or null at index ${i}`)
				}
			}
			if (fg.conductNoteWish !== undefined && fg.conductNoteWish !== null && fg.conductNoteWish !== '') {
				if (!ALLOWED_CONDUCT_NOTE_WISH.includes(fg.conductNoteWish as (typeof ALLOWED_CONDUCT_NOTE_WISH)[number])) {
					return badRequest(`conductNoteWish must be one of: ${ALLOWED_CONDUCT_NOTE_WISH.join(', ')} or null at index ${i}`)
				}
			}
		}

		await prisma.$transaction(
			rawFinalGrades.map((fg) => {
				const studentId = typeof fg.studentId === 'string' ? parseInt(fg.studentId, 10) : fg.studentId as number
				let gradeValue: number | null = null
				if (fg.grade !== null && fg.grade !== undefined) {
					gradeValue = typeof fg.grade === 'string' ? parseFloat(fg.grade) : (fg.grade as number)
				}
				let conductNoteWishValue: string | null = null
				if (fg.conductNoteWish !== undefined && fg.conductNoteWish !== null && fg.conductNoteWish !== '') {
					conductNoteWishValue = fg.conductNoteWish
				}
				return prisma.finalGrade.upsert({
					where: {
						studentId_classId_semester_schoolYearId: {
							studentId,
							classId: classIdNum,
							semester: fg.semester as 'first' | 'second',
							schoolYearId
						}
					},
					update: { grade: gradeValue, conductNoteWish: conductNoteWishValue },
					create: {
						studentId,
						classId: classIdNum,
						semester: fg.semester as 'first' | 'second',
						schoolYearId,
						grade: gradeValue,
						conductNoteWish: conductNoteWishValue
					}
				})
			})
		)

		return ok({ success: true, count: rawFinalGrades.length })
	} catch (error) {
		captureError(error as Error, {
			location: 'api/noten/final-grades',
			type: 'patch-final-grades',
			extra: {
				requestData,
				errorMessage: error instanceof Error ? error.message : String(error)
			}
		})
		return serverError('Failed to save final grades', { details: error instanceof Error ? error.message : String(error) })
	}
}
