import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

/**
 * Handles GET requests to retrieve all grades for a specific class.
 *
 * Returns grades grouped by student, teacher, and semester.
 *
 * @returns A JSON response containing grades in the format:
 * { [studentId]: { [teacherId]: { first: grade | null, second: grade | null } } }
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

		// Verify class exists
		const classRecord = await prisma.class.findUnique({
			where: { id: classId }
		})

		if (!classRecord) {
			return NextResponse.json(
				{ error: 'Class not found' },
				{ status: 404 }
			)
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
			if (!gradesByStudent[gradeRecord.studentId]) {
				gradesByStudent[gradeRecord.studentId] = {}
			}
			if (!gradesByStudent[gradeRecord.studentId][gradeRecord.teacherId]) {
				gradesByStudent[gradeRecord.studentId][gradeRecord.teacherId] = {
					first: null,
					second: null
				}
			}
			if (gradeRecord.semester === 'first') {
				gradesByStudent[gradeRecord.studentId][gradeRecord.teacherId].first = gradeRecord.grade
			} else if (gradeRecord.semester === 'second') {
				gradesByStudent[gradeRecord.studentId][gradeRecord.teacherId].second = gradeRecord.grade
			}
		}

		return NextResponse.json(gradesByStudent)
	} catch (error) {
		captureError(error, {
			location: 'api/notensammler/grades',
			type: 'fetch-grades'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch grades' },
			{ status: 500 }
		)
	}
}

/**
 * Handles POST requests to save or update a grade.
 *
 * Validates the grade value (must be one of: 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, or null),
 * verifies that student, teacher, and class exist, and upserts the grade record.
 *
 * @returns A JSON response with success status or an error message.
 */
export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { studentId, teacherId, classId, semester, grade } = body

		// Validate required fields
		if (studentId === undefined || teacherId === undefined || classId === undefined || semester === undefined) {
			return NextResponse.json(
				{ error: 'Missing required fields: studentId, teacherId, classId, semester' },
				{ status: 400 }
			)
		}

		// Validate semester
		if (semester !== 'first' && semester !== 'second') {
			return NextResponse.json(
				{ error: 'Semester must be "first" or "second"' },
				{ status: 400 }
			)
		}

		// Validate grade value (can be null or one of the allowed values)
		if (grade !== null && grade !== undefined) {
			const gradeNum = typeof grade === 'string' ? parseFloat(grade) : grade
			if (isNaN(gradeNum) || !ALLOWED_GRADES.includes(gradeNum)) {
				return NextResponse.json(
					{ error: `Grade must be one of: ${ALLOWED_GRADES.join(', ')} or null` },
					{ status: 400 }
				)
			}
		}

		// Verify student exists
		const student = await prisma.student.findUnique({
			where: { id: parseInt(studentId) }
		})
		if (!student) {
			return NextResponse.json(
				{ error: 'Student not found' },
				{ status: 404 }
			)
		}

		// Verify teacher exists
		const teacher = await prisma.teacher.findUnique({
			where: { id: parseInt(teacherId) }
		})
		if (!teacher) {
			return NextResponse.json(
				{ error: 'Teacher not found' },
				{ status: 404 }
			)
		}

		// Verify class exists
		const classRecord = await prisma.class.findUnique({
			where: { id: parseInt(classId) }
		})
		if (!classRecord) {
			return NextResponse.json(
				{ error: 'Class not found' },
				{ status: 404 }
			)
		}

		// Upsert grade (create or update)
		const gradeValue = grade === null || grade === undefined ? null : parseFloat(grade)

		await prisma.grade.upsert({
			where: {
				studentId_teacherId_classId_semester: {
					studentId: parseInt(studentId),
					teacherId: parseInt(teacherId),
					classId: parseInt(classId),
					semester: semester as 'first' | 'second'
				}
			},
			update: {
				grade: gradeValue
			},
			create: {
				studentId: parseInt(studentId),
				teacherId: parseInt(teacherId),
				classId: parseInt(classId),
				semester: semester as 'first' | 'second',
				grade: gradeValue
			}
		})

		return NextResponse.json({ success: true })
	} catch (error) {
		captureError(error, {
			location: 'api/notensammler/grades',
			type: 'save-grade',
			extra: { body }
		})
		return NextResponse.json(
			{ error: 'Failed to save grade' },
			{ status: 500 }
		)
	}
}

