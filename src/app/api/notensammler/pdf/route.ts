import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { generateNotensammlerPDF } from '@/lib/pdf-generator'

/**
 * Handles GET requests to generate and return a PDF of notensammler (grade collector) data for a specific class.
 *
 * @returns A PDF file as a response if successful, or a JSON error response with status 400 or 500 if an error occurs.
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const classIdParam = searchParams.get('classId')

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

		// Fetch class data
		const classRecord = await prisma.class.findUnique({
			where: { id: classId },
			include: {
				students: {
					orderBy: [
						{ lastName: 'asc' },
						{ firstName: 'asc' }
					],
					select: {
						id: true,
						firstName: true,
						lastName: true,
						groupId: true
					}
				}
			}
		})

		if (!classRecord) {
			return NextResponse.json(
				{ error: 'Class not found' },
				{ status: 404 }
			)
		}

		// Fetch teacher assignments
		const assignments = await prisma.teacherAssignment.findMany({
			where: { classId },
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

		// Fetch all grades for this class
		const grades = await prisma.grade.findMany({
			where: { classId },
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

		// Generate PDF
		const pdfBuffer = await generateNotensammlerPDF({
			className: classRecord.name,
			subjectName,
			students: classRecord.students,
			amTeachers,
			pmTeachers,
			grades: gradesByStudent
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

