import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_CONDUCT_NOTE_WISH = [
	'Sehr zufriedenstellend',
	'Zufriedenstellend',
	'Wenig Zufriedenstellend',
	'Nicht zufriedenstellend'
] as const
const MAX_CONDUCT_BATCH = 200

/**
 * PATCH: Save only conduct (Betragen) for the noten page. Stored in FinalGrade.conductNoteWish.
 * Not used in Notensammler transfer - only for the teacher's noten view.
 * Body: { classId, schoolYearId?, updates: Array<{ studentId, semester, conductNoteWish }> }
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
			updates: Array<{
				studentId: unknown
				semester: unknown
				conductNoteWish: string | null
			}>
		}
		requestData = body
		const { classId, schoolYearId: bodySchoolYearId, updates: rawUpdates } = body

		if (!rawUpdates || !Array.isArray(rawUpdates)) {
			return badRequest('updates must be an array')
		}
		if (rawUpdates.length > MAX_CONDUCT_BATCH) {
			return badRequest(`Too many updates. Maximum ${MAX_CONDUCT_BATCH} per request.`)
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

		for (let i = 0; i < rawUpdates.length; i++) {
			const u = rawUpdates[i]!
			const studentId = typeof u.studentId === 'string' ? parseInt(u.studentId, 10) : typeof u.studentId === 'number' ? u.studentId : NaN
			if (isNaN(studentId)) {
				return badRequest(`Invalid studentId at index ${i}`)
			}
			if (u.semester !== 'first' && u.semester !== 'second') {
				return badRequest(`Semester must be "first" or "second" at index ${i}`)
			}
			if (u.conductNoteWish !== null && u.conductNoteWish !== undefined && u.conductNoteWish !== '') {
				if (!ALLOWED_CONDUCT_NOTE_WISH.includes(u.conductNoteWish as (typeof ALLOWED_CONDUCT_NOTE_WISH)[number])) {
					return badRequest(`conductNoteWish must be one of: ${ALLOWED_CONDUCT_NOTE_WISH.join(', ')} or null at index ${i}`)
				}
			}
		}

		await prisma.$transaction(
			rawUpdates.map((u) => {
				const studentId = typeof u.studentId === 'string' ? parseInt(u.studentId, 10) : u.studentId as number
				const conductNoteWish =
					u.conductNoteWish !== null && u.conductNoteWish !== undefined && u.conductNoteWish !== ''
						? u.conductNoteWish
						: null
				return prisma.finalGrade.upsert({
					where: {
						studentId_classId_semester_schoolYearId: {
							studentId,
							classId: classIdNum,
							semester: u.semester as 'first' | 'second',
							schoolYearId
						}
					},
					update: { conductNoteWish },
					create: {
						studentId,
						classId: classIdNum,
						semester: u.semester as 'first' | 'second',
						schoolYearId,
						grade: null,
						conductNoteWish
					}
				})
			})
		)

		return ok({ success: true, count: rawUpdates.length })
	} catch (error) {
		captureError(error as Error, {
			location: 'api/noten/conduct',
			type: 'patch-conduct',
			extra: {
				requestData,
				errorMessage: error instanceof Error ? error.message : String(error)
			}
		})
		return serverError('Failed to save conduct', { details: error instanceof Error ? error.message : String(error) })
	}
}
