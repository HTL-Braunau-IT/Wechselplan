import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const ALLOWED_ATTENDANCE = ['Anwesend', 'Krank', 'Entschuldigt', 'Unentschuldigt'] as const
type AttendanceValue = typeof ALLOWED_ATTENDANCE[number]

type EntryPayload = {
	studentId: number
	date: string
	period: string
	attendance?: string | null
	wiederholung1?: number | null
	wiederholung2?: number | null
	bericht1?: number | null
	bericht2?: number | null
	mitarbeit1?: number | null
	mitarbeit2?: number | null
	praktischeArbeit1?: number | null
	praktischeArbeit2?: number | null
	notizen?: string | null
}

/**
 * PATCH/POST: Batch upsert NotenEntry rows. Body: { classId, groupId, schoolYearId, entries: EntryPayload[] }
 */
export async function PATCH(request: Request) {
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

		const body = await request.json()
		const { classId, groupId, schoolYearId, entries } = body as {
			classId?: number
			groupId?: number
			schoolYearId?: number
			entries?: EntryPayload[]
		}

		if (classId == null || groupId == null || schoolYearId == null || !Array.isArray(entries)) {
			return badRequest('Missing required fields')
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return forbidden('Teacher not found')
		}

		const isAssignedToClass = await prisma.teacherAssignment.findFirst({
			where: { teacherId: teacher.id, classId, schoolYearId }
		})
		if (!isAssignedToClass) {
			return forbidden('Not assigned to this class')
		}

		for (const e of entries) {
			if (e.studentId == null || !e.date || !e.period) continue
			if (e.period !== 'AM' && e.period !== 'PM') continue
			const dateOnly = new Date(e.date + 'T00:00:00.000Z')
			if (Number.isNaN(dateOnly.getTime())) continue
			const attendance: AttendanceValue | null =
				e.attendance != null && (ALLOWED_ATTENDANCE as readonly string[]).includes(e.attendance)
					? (e.attendance as AttendanceValue)
					: null
			const clampGrade = (v: unknown): number | null => {
				if (v == null) return null
				const n = Number(v)
				return ALLOWED_GRADES.includes(n) ? n : null
			}
			await prisma.notenEntry.upsert({
				where: {
					studentId_teacherId_classId_groupId_schoolYearId_date_period: {
						studentId: e.studentId,
						teacherId: teacher.id,
						classId,
						groupId,
						schoolYearId,
						date: dateOnly,
						period: e.period
					}
				},
				create: {
					studentId: e.studentId,
					teacherId: teacher.id,
					classId,
					groupId,
					schoolYearId,
					date: dateOnly,
					period: e.period,
					attendance,
					wiederholung1: clampGrade(e.wiederholung1),
					wiederholung2: clampGrade(e.wiederholung2),
					bericht1: clampGrade(e.bericht1),
					bericht2: clampGrade(e.bericht2),
					mitarbeit1: clampGrade(e.mitarbeit1),
					mitarbeit2: clampGrade(e.mitarbeit2),
					praktischeArbeit1: clampGrade(e.praktischeArbeit1),
					praktischeArbeit2: clampGrade(e.praktischeArbeit2),
					notizen: e.notizen != null ? String(e.notizen) : null
				},
				update: {
					attendance,
					wiederholung1: clampGrade(e.wiederholung1),
					wiederholung2: clampGrade(e.wiederholung2),
					bericht1: clampGrade(e.bericht1),
					bericht2: clampGrade(e.bericht2),
					mitarbeit1: clampGrade(e.mitarbeit1),
					mitarbeit2: clampGrade(e.mitarbeit2),
					praktischeArbeit1: clampGrade(e.praktischeArbeit1),
					praktischeArbeit2: clampGrade(e.praktischeArbeit2),
					notizen: e.notizen != null ? String(e.notizen) : null
				}
			})
		}

		return ok({ success: true })
	} catch (error) {
		captureError(error, {
			location: 'api/noten/entries',
			type: 'save-entries'
		})
		return serverError('Failed to save entries')
	}
}

export { PATCH as POST }
