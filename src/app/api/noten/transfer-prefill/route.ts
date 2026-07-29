import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'

type WeightConfig = {
	weightWiederholung: number
	weightBericht: number
	weightMitarbeit: number
	weightPraktischeArbeit: number
}

function isSemester2(dateStr: string, semesterChangeDate: string | undefined): boolean {
	if (!semesterChangeDate) return false
	const change = semesterChangeDate.slice(0, 10)
	return dateStr >= change
}

/**
 * Compute weighted day grade from one entry; return null if no grades.
 */
function dayGradeFromEntry(
	e: {
		wiederholung1: number | null
		wiederholung2: number | null
		bericht1: number | null
		bericht2: number | null
		mitarbeit1: number | null
		mitarbeit2: number | null
		praktischeArbeit1: number | null
		praktischeArbeit2: number | null
	},
	w: WeightConfig
): number | null {
	const avgW =
		e.wiederholung1 != null && e.wiederholung2 != null
			? (e.wiederholung1 + e.wiederholung2) / 2
			: e.wiederholung1 ?? e.wiederholung2 ?? null
	const avgB =
		e.bericht1 != null && e.bericht2 != null ? (e.bericht1 + e.bericht2) / 2 : e.bericht1 ?? e.bericht2 ?? null
	const avgM =
		e.mitarbeit1 != null && e.mitarbeit2 != null ? (e.mitarbeit1 + e.mitarbeit2) / 2 : e.mitarbeit1 ?? e.mitarbeit2 ?? null
	const avgP =
		e.praktischeArbeit1 != null && e.praktischeArbeit2 != null
			? (e.praktischeArbeit1 + e.praktischeArbeit2) / 2
			: e.praktischeArbeit1 ?? e.praktischeArbeit2 ?? null
	if (avgW == null && avgB == null && avgM == null && avgP == null) return null
	const sum =
		(avgW ?? 0) * w.weightWiederholung +
		(avgB ?? 0) * w.weightBericht +
		(avgM ?? 0) * w.weightMitarbeit +
		(avgP ?? 0) * w.weightPraktischeArbeit
	const div =
		(avgW != null ? w.weightWiederholung : 0) +
		(avgB != null ? w.weightBericht : 0) +
		(avgM != null ? w.weightMitarbeit : 0) +
		(avgP != null ? w.weightPraktischeArbeit : 0)
	return div === 0 ? null : sum / div
}

/** Normalize stored grade to 1-5 for prefill; 6/7 (Nicht beurteilt/Gestundet) become null. */
function normalizeStoredGrade(grade: number | null | undefined): number | null {
	if (grade == null || Number.isNaN(grade)) return null
	const n = Number(grade)
	if (n >= 1 && n <= 5) return n
	// 6, 7 or out of range -> show as "no grade" in list
	return null
}

/**
 * GET: Returns students (optionally filtered by groupId) and prefill grades per semester for the transfer modal.
 * Prefill uses stored Endnoten (FinalGrade / Grade when Notensammler enabled) first, then falls back to calculated grades from NotenEntry.
 * When groupId is provided, only students in that group are returned and prefill is computed only for that group.
 * Response includes teacher { id, firstName, lastName } for building Notenmanagement Kommentar.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

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

		const { searchParams } = new URL(request.url)
		const classIdParam = searchParams.get('classId')
		const schoolYearIdParam = searchParams.get('schoolYearId')
		const groupIdParam = searchParams.get('groupId')

		if (!classIdParam) {
			return NextResponse.json({ error: 'classId required' }, { status: 400 })
		}
		const classId = parseInt(classIdParam, 10)
		if (Number.isNaN(classId)) {
			return NextResponse.json({ error: 'Invalid classId' }, { status: 400 })
		}

		const groupId =
			groupIdParam !== null && groupIdParam !== '' ? parseInt(groupIdParam, 10) : null
		if (groupId !== null && Number.isNaN(groupId)) {
			return NextResponse.json({ error: 'Invalid groupId' }, { status: 400 })
		}

		let schoolYearId: number | undefined = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
		if (schoolYearId == null || Number.isNaN(schoolYearId)) {
			const now = new Date()
			const current = await prisma.schoolYear.findFirst({
				where: { startDate: { lte: now }, endDate: { gte: now } },
				select: { id: true, semesterChangeDate: true }
			})
			schoolYearId =
				current?.id ??
				(await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true, semesterChangeDate: true } }))?.id
		}
		if (schoolYearId == null) {
			return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({
			where: { username },
			select: { id: true, firstName: true, lastName: true }
		})
		if (!teacher) {
			return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
		}

		const assignments = await prisma.teacherAssignment.findMany({
			where: { teacherId: teacher.id, classId, schoolYearId },
			select: { groupId: true }
		})
		let assignedGroupIds = [...new Set(assignments.map((a) => a.groupId))]
		if (groupId !== null) {
			// Class-level check: a teacher assigned to this class (any group) may transfer any
			// group in it. Prefill calculation stays teacher-scoped below, so for groups the
			// teacher does not personally teach only stored Endnoten surface (calculation empty).
			if (assignments.length === 0) {
				return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
			}
			assignedGroupIds = [groupId]
		}

		const notensammlerEnabled = await isFeatureEnabled('notensammler')
		const [finalGradeRows, gradeRows] = await Promise.all([
			prisma.finalGrade.findMany({
				where: { classId, schoolYearId },
				select: { studentId: true, semester: true, grade: true }
			}),
			notensammlerEnabled
				? prisma.grade.findMany({
						where: { teacherId: teacher.id, classId, schoolYearId },
						select: { studentId: true, semester: true, grade: true }
					})
				: Promise.resolve([])
		])

		const schoolYear = await prisma.schoolYear.findUnique({
			where: { id: schoolYearId },
			select: { semesterChangeDate: true }
		})
		const semesterChangeDate = schoolYear?.semesterChangeDate
			? schoolYear.semesterChangeDate instanceof Date
				? schoolYear.semesterChangeDate.toISOString().slice(0, 10)
				: String(schoolYear.semesterChangeDate)
			: undefined

		const membershipIds = await prisma.classMembership.findMany({
			where: { classId, schoolYearId },
			select: { studentId: true }
		})
		const studentIds = membershipIds.map((m) => m.studentId)
		if (studentIds.length === 0) {
			return NextResponse.json({
				students: [],
				prefill: {},
				teacherId: teacher.id,
				teacher: { id: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName }
			})
		}

		const students = await prisma.student.findMany({
			where: {
				id: { in: studentIds },
				...(groupId !== null ? { groupId } : {})
			},
			select: { id: true, firstName: true, lastName: true, groupId: true },
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		})

		const prefill: Record<number, { first: number | null; second: number | null }> = {}
		for (const s of students) {
			prefill[s.id] = { first: null, second: null }
		}

		// Build stored grades (same merge logic as data API): FinalGrade base, then overlay Grade when Notensammler enabled
		const storedGrades: Record<number, { first: number | null; second: number | null }> = {}
		for (const row of finalGradeRows) {
			storedGrades[row.studentId] ??= { first: null, second: null }
			if (row.semester === 'first') {
				storedGrades[row.studentId]!.first = notensammlerEnabled ? null : normalizeStoredGrade(row.grade)
			} else if (row.semester === 'second') {
				storedGrades[row.studentId]!.second = notensammlerEnabled ? null : normalizeStoredGrade(row.grade)
			}
		}
		if (notensammlerEnabled) {
			for (const row of gradeRows) {
				storedGrades[row.studentId] ??= { first: null, second: null }
				if (row.semester === 'first') {
					storedGrades[row.studentId]!.first = normalizeStoredGrade(row.grade)
				} else if (row.semester === 'second') {
					storedGrades[row.studentId]!.second = normalizeStoredGrade(row.grade)
				}
			}
		}

		// Apply stored grades to prefill (only for students in our list)
		for (const s of students) {
			const stored = storedGrades[s.id]
			if (stored) {
				prefill[s.id]!.first = stored.first ?? prefill[s.id]!.first
				prefill[s.id]!.second = stored.second ?? prefill[s.id]!.second
			}
		}

		if (assignedGroupIds.length === 0) {
			return NextResponse.json({
				students,
				prefill,
				teacherId: teacher.id,
				teacher: { id: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName }
			})
		}

		for (const gid of assignedGroupIds) {
			const [weightConfigRow, entries] = await Promise.all([
				prisma.notenWeightConfig.findUnique({
					where: {
						teacherId_classId_groupId_schoolYearId: {
							teacherId: teacher.id,
							classId,
							groupId: gid,
							schoolYearId
						}
					}
				}),
				prisma.notenEntry.findMany({
					where: { teacherId: teacher.id, classId, groupId: gid, schoolYearId }
				})
			])

			const w: WeightConfig = weightConfigRow
				? {
						weightWiederholung: weightConfigRow.weightWiederholung,
						weightBericht: weightConfigRow.weightBericht,
						weightMitarbeit: weightConfigRow.weightMitarbeit,
						weightPraktischeArbeit: weightConfigRow.weightPraktischeArbeit
					}
				: { weightWiederholung: 25, weightBericht: 25, weightMitarbeit: 25, weightPraktischeArbeit: 25 }

			const entriesByStudent = new Map<
				number,
				Array<{
					date: string
					period: string
					wiederholung1: number | null
					wiederholung2: number | null
					bericht1: number | null
					bericht2: number | null
					mitarbeit1: number | null
					mitarbeit2: number | null
					praktischeArbeit1: number | null
					praktischeArbeit2: number | null
				}>
			>()
			for (const e of entries) {
				const dateStr = e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date)
				const list = entriesByStudent.get(e.studentId) ?? []
				list.push({
					date: dateStr,
					period: e.period,
					wiederholung1: e.wiederholung1,
					wiederholung2: e.wiederholung2,
					bericht1: e.bericht1,
					bericht2: e.bericht2,
					mitarbeit1: e.mitarbeit1,
					mitarbeit2: e.mitarbeit2,
					praktischeArbeit1: e.praktischeArbeit1,
					praktischeArbeit2: e.praktischeArbeit2
				})
				entriesByStudent.set(e.studentId, list)
			}

			for (const s of students) {
				if (s.groupId !== gid) continue
				const list = entriesByStudent.get(s.id)
				if (!list || list.length === 0) continue

				const dayGradesFirst: number[] = []
				const dayGradesSecond: number[] = []
				for (const entry of list) {
					const dg = dayGradeFromEntry(entry, w)
					if (dg == null) continue
					if (isSemester2(entry.date, semesterChangeDate)) {
						dayGradesSecond.push(dg)
					} else {
						dayGradesFirst.push(dg)
					}
				}

				const first =
					dayGradesFirst.length > 0
						? Math.round((dayGradesFirst.reduce((a, b) => a + b, 0) / dayGradesFirst.length) * 2) / 2
						: null
				const second =
					dayGradesSecond.length > 0
						? Math.round((dayGradesSecond.reduce((a, b) => a + b, 0) / dayGradesSecond.length) * 2) / 2
						: null
				// Fallback: use calculated from daily noten only when no stored Endnote
				prefill[s.id]!.first = prefill[s.id]!.first ?? first
				prefill[s.id]!.second = prefill[s.id]!.second ?? second
			}
		}

		return NextResponse.json({
			students,
			prefill,
			teacherId: teacher.id,
			teacher: { id: teacher.id, firstName: teacher.firstName, lastName: teacher.lastName }
		})
	} catch (error) {
		captureError(error as Error, {
			location: 'api/noten/transfer-prefill',
			type: 'transfer-prefill'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch transfer prefill' },
			{ status: 500 }
		)
	}
}
