import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'

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
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

	let requestData: unknown
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
			return NextResponse.json({ error: 'updates must be an array' }, { status: 400 })
		}
		if (rawUpdates.length > MAX_CONDUCT_BATCH) {
			return NextResponse.json(
				{ error: `Too many updates. Maximum ${MAX_CONDUCT_BATCH} per request.` },
				{ status: 400 }
			)
		}

		const classIdNum =
			typeof classId === 'string' ? parseInt(classId, 10) : typeof classId === 'number' ? classId : NaN
		if (isNaN(classIdNum)) {
			return NextResponse.json({ error: 'Invalid classId' }, { status: 400 })
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
			return NextResponse.json(
				{ error: 'No school year found.' },
				{ status: 400 }
			)
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
		}

		const isAssignedToClass = await prisma.teacherAssignment.findFirst({
			where: { teacherId: teacher.id, classId: classIdNum, schoolYearId }
		})
		if (!isAssignedToClass) {
			return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
		}

		for (let i = 0; i < rawUpdates.length; i++) {
			const u = rawUpdates[i]!
			const studentId = typeof u.studentId === 'string' ? parseInt(u.studentId, 10) : typeof u.studentId === 'number' ? u.studentId : NaN
			if (isNaN(studentId)) {
				return NextResponse.json({ error: `Invalid studentId at index ${i}` }, { status: 400 })
			}
			if (u.semester !== 'first' && u.semester !== 'second') {
				return NextResponse.json({ error: `Semester must be "first" or "second" at index ${i}` }, { status: 400 })
			}
			if (u.conductNoteWish !== null && u.conductNoteWish !== undefined && u.conductNoteWish !== '') {
				if (!ALLOWED_CONDUCT_NOTE_WISH.includes(u.conductNoteWish as (typeof ALLOWED_CONDUCT_NOTE_WISH)[number])) {
					return NextResponse.json(
						{ error: `conductNoteWish must be one of: ${ALLOWED_CONDUCT_NOTE_WISH.join(', ')} or null at index ${i}` },
						{ status: 400 }
					)
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

		return NextResponse.json({ success: true, count: rawUpdates.length })
	} catch (error) {
		captureError(error as Error, {
			location: 'api/noten/conduct',
			type: 'patch-conduct',
			extra: {
				requestData,
				errorMessage: error instanceof Error ? error.message : String(error)
			}
		})
		return NextResponse.json(
			{ error: 'Failed to save conduct', details: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		)
	}
}
