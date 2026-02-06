import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { generateNotensammlerAllClassesPDF } from '@/lib/pdf-generator'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { normalizeUsername } from '@/lib/username'
import type { NotensammlerAllClassesClassData } from '@/lib/pdf-generator'

/**
 * Handles GET requests to generate a PDF of the current teacher's grades for all classes they are assigned to.
 *
 * @returns A PDF file as response, or JSON error with status 400/404/500.
 */
export async function GET() {
	try {
		const session = await getServerSession(authOptions)
		if (!session?.user?.name) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}
		if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
		}

		const username = normalizeUsername(session.user.name)
		const teacher = await prisma.teacher.findUnique({
			where: { username },
			select: { id: true, firstName: true, lastName: true }
		})

		if (!teacher) {
			return NextResponse.json(
				{ error: 'Teacher not found' },
				{ status: 404 }
			)
		}

		const assignments = await prisma.teacherAssignment.findMany({
			where: { teacherId: teacher.id },
			select: { classId: true }
		})
		const distinctClassIds = Array.from(new Set(assignments.map((a) => a.classId)))

		if (distinctClassIds.length === 0) {
			return NextResponse.json(
				{ error: 'No classes assigned' },
				{ status: 400 }
			)
		}

		const classRecords = await prisma.class.findMany({
			where: { id: { in: distinctClassIds } },
			include: {
				students: {
					orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
					select: { id: true, firstName: true, lastName: true, groupId: true }
				}
			},
			orderBy: { name: 'asc' }
		})

		const classesPayload: NotensammlerAllClassesClassData[] = []

		for (const classRecord of classRecords) {
			const assignmentsForClass = await prisma.teacherAssignment.findMany({
				where: { classId: classRecord.id },
				include: {
					subject: { select: { name: true } }
				}
			})
			let subjectName: string | undefined
			const subjectCounts = new Map<string, number>()
			for (const a of assignmentsForClass) {
				if (a.subject?.name) {
					subjectCounts.set(a.subject.name, (subjectCounts.get(a.subject.name) ?? 0) + 1)
				}
			}
			let maxCount = 0
			for (const [name, count] of subjectCounts) {
				if (count > maxCount) {
					maxCount = count
					subjectName = name
				}
			}

			const grades = await prisma.grade.findMany({
				where: { classId: classRecord.id, teacherId: teacher.id },
				select: { studentId: true, semester: true, grade: true }
			})
			const gradesForTeacher: Record<number, { first: number | null; second: number | null }> = {}
			for (const g of grades) {
				gradesForTeacher[g.studentId] ??= { first: null, second: null }
				if (g.semester === 'first') gradesForTeacher[g.studentId]!.first = g.grade
				if (g.semester === 'second') gradesForTeacher[g.studentId]!.second = g.grade
			}

			const finalGradeRecords = await prisma.finalGrade.findMany({
				where: { classId: classRecord.id },
				select: { studentId: true, semester: true, grade: true }
			})
			const finalGrades: Record<number, { first: number | null; second: number | null }> = {}
			for (const fg of finalGradeRecords) {
				finalGrades[fg.studentId] ??= { first: null, second: null }
				if (fg.semester === 'first') finalGrades[fg.studentId]!.first = fg.grade
				if (fg.semester === 'second') finalGrades[fg.studentId]!.second = fg.grade
			}

			classesPayload.push({
				className: classRecord.name,
				subjectName,
				students: classRecord.students,
				grades: gradesForTeacher,
				finalGrades
			})
		}

		const teacherName = `${teacher.firstName} ${teacher.lastName}`.trim()
		const pdfBuffer = await generateNotensammlerAllClassesPDF({
			teacherName: teacherName || 'Lehrperson',
			classes: classesPayload
		})

		const today = new Date().toISOString().slice(0, 10)
		return new NextResponse(pdfBuffer as unknown as BodyInit, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename=notensammler-alle-klassen-${today}.pdf`
			}
		})
	} catch (error) {
		captureError(error as Error, {
			location: 'api/notensammler/pdf/all',
			type: 'export-pdf-all'
		})
		return NextResponse.json(
			{ error: 'Failed to generate PDF' },
			{ status: 500 }
		)
	}
}
