import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { generateNotensammlerPDF } from '@/lib/pdf-generator'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Handles GET requests to generate and return a PDF of notensammler (grade collector) data for a specific class.
 *
 * @returns A PDF file as a response if successful, or a JSON error response with status 400 or 500 if an error occurs.
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

		const { searchParams } = new URL(request.url)
		const classIdParam = searchParams.get('classId')
		const schoolYearIdParam = searchParams.get('schoolYearId')

		if (!classIdParam) {
			return NextResponse.json(
				{ error: 'classId parameter is required' },
				{ status: 400 }
			)
		}

		const classId = parseInt(classIdParam)
		if (isNaN(classId)) {
			return NextResponse.json(
				{ error: 'Invalid classId' },
				{ status: 400 }
			)
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

		// Fetch class (students by year via ClassMembership below)
		const classRecord = await prisma.class.findUnique({
			where: { id: classId }
		})

		if (!classRecord) {
			return NextResponse.json(
				{ error: 'Class not found' },
				{ status: 404 }
			)
		}

		const memberships = await prisma.classMembership.findMany({
			where: { classId, schoolYearId },
			select: { studentId: true }
		})
		const studentIds = memberships.map((m) => m.studentId)
		const studentsList =
			studentIds.length > 0
				? await prisma.student.findMany({
						where: { id: { in: studentIds } },
						orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
						select: { id: true, firstName: true, lastName: true, groupId: true }
					})
				: []

		// Fetch teacher assignments for this year
		const assignments = await prisma.teacherAssignment.findMany({
			where: { classId, schoolYearId },
			include: {
				teacher: {
					select: {
						id: true,
						firstName: true,
						lastName: true
					}
				},
				subject: {
					select: {
						id: true,
						name: true
					}
				}
			}
		})

		// Get unique teachers grouped by period (AM/PM)
		const amTeachersMap = new Map<number, { id: number; firstName: string; lastName: string }>()
		const pmTeachersMap = new Map<number, { id: number; firstName: string; lastName: string }>()
		
		for (const assignment of assignments) {
			const teacherData = {
				id: assignment.teacher.id,
				firstName: assignment.teacher.firstName,
				lastName: assignment.teacher.lastName
			}

			if (assignment.period === 'AM' && !amTeachersMap.has(assignment.teacherId)) {
				amTeachersMap.set(assignment.teacherId, teacherData)
			} else if (assignment.period === 'PM' && !pmTeachersMap.has(assignment.teacherId)) {
				pmTeachersMap.set(assignment.teacherId, teacherData)
			}
		}

		// Sort teachers by last name, then first name
		const sortTeachers = (teachers: Array<{ id: number; firstName: string; lastName: string }>) => {
			return teachers.sort((a, b) => {
				const lastNameCompare = a.lastName.localeCompare(b.lastName)
				if (lastNameCompare !== 0) return lastNameCompare
				return a.firstName.localeCompare(b.firstName)
			})
		}

		const amTeachers = sortTeachers(Array.from(amTeachersMap.values()))
		const pmTeachers = sortTeachers(Array.from(pmTeachersMap.values()))

		// Determine subject to display (most common subject from assignments)
		let subjectName: string | undefined = undefined
		if (assignments.length > 0) {
			// Count occurrences of each subject
			const subjectCounts = new Map<string, number>()
			for (const assignment of assignments) {
				if (assignment.subject?.name) {
					const currentCount = subjectCounts.get(assignment.subject.name) ?? 0
					subjectCounts.set(assignment.subject.name, currentCount + 1)
				}
			}

			// Find the most common subject
			let maxCount = 0
			let mostCommonSubject: string | undefined = undefined
			for (const [subject, count] of subjectCounts.entries()) {
				if (count > maxCount) {
					maxCount = count
					mostCommonSubject = subject
				}
			}

			subjectName = mostCommonSubject
		}

		// Fetch all grades for this class and year
		const grades = await prisma.grade.findMany({
			where: { classId, schoolYearId },
			select: {
				studentId: true,
				teacherId: true,
				semester: true,
				grade: true
			}
		})

		// Group grades by student, then teacher, then semester
		const gradesByStudent: Record<number, Record<number, { first: number | null; second: number | null }>> = {}

		for (const gradeRecord of grades) {
			gradesByStudent[gradeRecord.studentId] ??= {}
			const studentGrades = gradesByStudent[gradeRecord.studentId]!
			studentGrades[gradeRecord.teacherId] ??= {
				first: null,
				second: null
			}
			const teacherGrades = studentGrades[gradeRecord.teacherId]!
			if (gradeRecord.semester === 'first') {
				teacherGrades.first = gradeRecord.grade
			} else if (gradeRecord.semester === 'second') {
				teacherGrades.second = gradeRecord.grade
			}
		}

		// Fetch final grades for this class and year (including Betragensnote Wunsch)
		const finalGradeRecords = await prisma.finalGrade.findMany({
			where: { classId, schoolYearId },
			select: { studentId: true, semester: true, grade: true, conductNoteWish: true }
		})
		const finalGrades: Record<number, { first: number | null; second: number | null; conductWishFirst: string | null; conductWishSecond: string | null }> = {}
		for (const fg of finalGradeRecords) {
			finalGrades[fg.studentId] ??= { first: null, second: null, conductWishFirst: null, conductWishSecond: null }
			if (fg.semester === 'first') {
				finalGrades[fg.studentId]!.first = fg.grade
				finalGrades[fg.studentId]!.conductWishFirst = fg.conductNoteWish ?? null
			} else if (fg.semester === 'second') {
				finalGrades[fg.studentId]!.second = fg.grade
				finalGrades[fg.studentId]!.conductWishSecond = fg.conductNoteWish ?? null
			}
		}

		// Generate PDF
		const pdfBuffer = await generateNotensammlerPDF({
			className: classRecord.name,
			subjectName,
			students: studentsList,
			amTeachers,
			pmTeachers,
			grades: gradesByStudent,
			finalGrades
		})

		return new NextResponse(pdfBuffer as unknown as BodyInit, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename=notensammler-${classRecord.name}.pdf`
			}
		})
	} catch (error) {
		captureError(error as Error, {
			location: 'api/notensammler/pdf',
			type: 'export-pdf'
		})
		return NextResponse.json(
			{ error: 'Failed to generate PDF' },
			{ status: 500 }
		)
	}
}

