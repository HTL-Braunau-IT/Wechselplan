import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { toLocalDateString } from '@/lib/date-utils'

function dateToLocalString(d: Date | string): string {
	return d instanceof Date ? toLocalDateString(d) : String(d)
}

/**
 * GET: Returns weight config, Lehrstoff per day, and all NotenEntry rows for (teacher, class, group, school year).
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
		if (!(await isFeatureEnabled('noten'))) {
			return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
		}

		const { searchParams } = new URL(request.url)
		const classIdParam = searchParams.get('classId')
		const groupIdParam = searchParams.get('groupId')
		const schoolYearIdParam = searchParams.get('schoolYearId')

		if (!classIdParam || !groupIdParam) {
			return NextResponse.json({ error: 'classId and groupId required' }, { status: 400 })
		}
		const classId = parseInt(classIdParam, 10)
		const groupId = parseInt(groupIdParam, 10)
		if (Number.isNaN(classId) || Number.isNaN(groupId)) {
			return NextResponse.json({ error: 'Invalid classId or groupId' }, { status: 400 })
		}

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
		const teacher = await prisma.teacher.findUnique({ where: { username } })
		if (!teacher) {
			return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
		}

		const isAssignedToClass = await prisma.teacherAssignment.findFirst({
			where: { teacherId: teacher.id, classId, schoolYearId }
		})
		if (!isAssignedToClass) {
			return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
		}

		const notensammlerEnabled = await isFeatureEnabled('notensammler')

		const [weightConfig, lehrstoffRows, entries, gradeRows, finalGradeRows] = await Promise.all([
			prisma.notenWeightConfig.findUnique({
				where: {
					teacherId_classId_groupId_schoolYearId: {
						teacherId: teacher.id,
						classId,
						groupId,
						schoolYearId
					}
				}
			}),
			prisma.lehrstoffPerDay.findMany({
				where: { teacherId: teacher.id, classId, groupId, schoolYearId }
			}),
			prisma.notenEntry.findMany({
				where: { teacherId: teacher.id, classId, groupId, schoolYearId }
			}),
			notensammlerEnabled
				? prisma.grade.findMany({
						where: { teacherId: teacher.id, classId, schoolYearId },
						select: { studentId: true, semester: true, grade: true }
					})
				: Promise.resolve([]),
			prisma.finalGrade.findMany({
				where: { classId, schoolYearId },
				select: { studentId: true, semester: true, grade: true, conductNoteWish: true }
			})
		])

		const lehrstoffByDay: Record<string, string> = {}
		for (const row of lehrstoffRows) {
			const dateKey = `${dateToLocalString(row.date)}-${row.period}`
			lehrstoffByDay[dateKey] = row.lehrstoff ?? ''
		}

		const finalGrades: Record<
			number,
			{ first: { grade: number | null; conductNoteWish: string | null }; second: { grade: number | null; conductNoteWish: string | null } }
		> = {}
		for (const row of finalGradeRows) {
			finalGrades[row.studentId] ??= {
				first: { grade: null, conductNoteWish: null },
				second: { grade: null, conductNoteWish: null }
			}
			if (row.semester === 'first') {
				finalGrades[row.studentId]!.first = {
					grade: notensammlerEnabled ? null : row.grade,
					conductNoteWish: row.conductNoteWish ?? null
				}
			} else if (row.semester === 'second') {
				finalGrades[row.studentId]!.second = {
					grade: notensammlerEnabled ? null : row.grade,
					conductNoteWish: row.conductNoteWish ?? null
				}
			}
		}
		if (notensammlerEnabled) {
			for (const row of gradeRows) {
				finalGrades[row.studentId] ??= {
					first: { grade: null, conductNoteWish: null },
					second: { grade: null, conductNoteWish: null }
				}
				if (row.semester === 'first') {
					finalGrades[row.studentId]!.first = { ...finalGrades[row.studentId]!.first, grade: row.grade }
				} else if (row.semester === 'second') {
					finalGrades[row.studentId]!.second = { ...finalGrades[row.studentId]!.second, grade: row.grade }
				}
			}
		}

		return NextResponse.json({
			weightConfig: weightConfig
				? {
						weightWiederholung: weightConfig.weightWiederholung,
						weightBericht: weightConfig.weightBericht,
						weightMitarbeit: weightConfig.weightMitarbeit,
						weightPraktischeArbeit: weightConfig.weightPraktischeArbeit
					}
				: null,
			lehrstoffByDay,
			finalGrades,
			...(notensammlerEnabled ? { teacherId: teacher.id } : {}),
			entries: entries.map((e) => ({
				studentId: e.studentId,
				date: dateToLocalString(e.date),
				period: e.period,
				attendance: e.attendance,
				wiederholung1: e.wiederholung1,
				wiederholung2: e.wiederholung2,
				bericht1: e.bericht1,
				bericht2: e.bericht2,
				mitarbeit1: e.mitarbeit1,
				mitarbeit2: e.mitarbeit2,
				praktischeArbeit1: e.praktischeArbeit1,
				praktischeArbeit2: e.praktischeArbeit2,
				notizen: e.notizen
			}))
		})
	} catch (error) {
		captureError(error, {
			location: 'api/noten/data',
			type: 'fetch-data'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch data' },
			{ status: 500 }
		)
	}
}
