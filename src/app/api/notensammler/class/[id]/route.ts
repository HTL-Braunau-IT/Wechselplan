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
				}
			}
		})

		// Get unique teachers (by teacherId)
		const uniqueTeachersMap = new Map<number, { id: number; firstName: string; lastName: string }>()
		
		for (const assignment of assignments) {
			if (!uniqueTeachersMap.has(assignment.teacherId)) {
				uniqueTeachersMap.set(assignment.teacherId, {
					id: assignment.teacher.id,
					firstName: assignment.teacher.firstName,
					lastName: assignment.teacher.lastName
				})
			}
		}

		const teachers = Array.from(uniqueTeachersMap.values())
			.sort((a, b) => {
				const lastNameCompare = a.lastName.localeCompare(b.lastName)
				if (lastNameCompare !== 0) return lastNameCompare
				return a.firstName.localeCompare(b.firstName)
			})

		return NextResponse.json({
			id: classRecord.id,
			name: classRecord.name,
			description: classRecord.description,
			students: classRecord.students,
			teachers
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

