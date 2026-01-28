import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'

/**
 * Handles GET requests to retrieve class data with students and unique teachers.
 *
 * Returns class information, all students in the class (with groupId), and unique teachers
 * assigned to the class via TeacherAssignment (both AM and PM periods).
 *
 * @returns A JSON response containing class info, students array, and teachers array.
 */
export async function GET(
	request: Request,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	context: any
) {
	try {
		const id = context?.params?.id
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		const classId = parseInt(id)

		if (isNaN(classId)) {
			return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })
		}

		// Fetch class with students
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
			return NextResponse.json({ error: 'Class not found' }, { status: 404 })
		}

		// Fetch all teacher assignments for this class
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

	// Fetch transfer status for this class
	const transfers = await prisma.notenmanagementTransfer.findMany({
		where: { classId },
		select: { semester: true, lfId: true },
	})

	const transferStatus = {
		first: {
			transferred: transfers.some((t) => t.semester === 'first'),
			lfId: transfers.find((t) => t.semester === 'first')?.lfId ?? null,
		},
		second: {
			transferred: transfers.some((t) => t.semester === 'second'),
			lfId: transfers.find((t) => t.semester === 'second')?.lfId ?? null,
		},
	}

	return NextResponse.json({
		id: classRecord.id,
		name: classRecord.name,
		description: classRecord.description,
		subjectName,
		students: classRecord.students,
		amTeachers,
		pmTeachers,
		transferStatus,
	})
	} catch (error) {
		captureError(error, {
			location: 'api/notensammler/class/[id]',
			type: 'fetch-class-data'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch class data' },
			{ status: 500 }
		)
	}
}

