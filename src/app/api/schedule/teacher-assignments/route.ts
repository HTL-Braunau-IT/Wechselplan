import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'


/**
 * Handles GET requests to retrieve teacher assignments for a specified class.
 *
 * Parses the `class` query parameter from the request URL, fetches the corresponding class and its teacher assignments from the database, and returns the assignments grouped by AM and PM periods. Returns appropriate error responses if the class parameter is missing, the class is not found, or an unexpected error occurs.
 *
 * @returns A JSON response containing `amAssignments` and `pmAssignments` arrays, or an error message with the appropriate HTTP status code.
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const className = searchParams.get('class')

		if (!className) {
			return NextResponse.json(
				{ error: 'Class parameter is required' },
				{ status: 400 }
			)
		}

		// First find the class by name
		const classRecord = await prisma.class.findUnique({
			where: { name: className }
		})

		if (!classRecord) {
			captureError(new Error('Class not found'), {
				location: 'api/schedule/teacher-assignments',
				type: 'fetch-assignments',
				extra: {
					searchParams: Object.fromEntries(new URL(request.url).searchParams)
				}
			})
			return NextResponse.json(
				{ error: 'Class not found' },
				{ status: 404 }
			)
		}

		// Fetch existing assignments for this class
		const assignments = await prisma.teacherAssignment.findMany({
			where: { classId: classRecord.id },
			orderBy: [
				{ period: 'asc' },
				{ groupId: 'asc' }
			],
			include: {
				teacher: true,
				subject: true,
				learningContent: true,
				room: true
			}
		})

		// Group assignments by period
		const amAssignments = assignments
			.filter(a => a.period === 'AM')
			.map(a => ({
				groupId: a.groupId,
				teacherId: a.teacherId,
				teacherFirstName: a.teacher.firstName,
				teacherLastName: a.teacher.lastName,
				subject: a.subject.name,
				learningContent: a.learningContent.name,
				room: a.room.name
			}))

		const pmAssignments = assignments
			.filter(a => a.period === 'PM')
			.map(a => ({
				groupId: a.groupId,
				teacherId: a.teacherId,
				teacherFirstName: a.teacher.firstName,
				teacherLastName: a.teacher.lastName,
				subject: a.subject.name,
				learningContent: a.learningContent.name,
				room: a.room.name
			}))

		return NextResponse.json({
			amAssignments,
			pmAssignments
		})
	} catch (error) {

		captureError(error, {
			location: 'api/schedule/teacher-assignments',
			type: 'fetch-assignments',
			extra: {
				searchParams: Object.fromEntries(new URL(request.url).searchParams)
			}
		})
		return NextResponse.json(
			{ error: 'Failed to fetch teacher assignments' },
			{ status: 500 }
		)
	}
}

/**
 * Handles creation or updating of teacher assignments for a specified class.
 *
 * Accepts a JSON payload containing the class name, AM and PM teacher assignments, and an optional flag to update existing assignments. Validates the existence of the class and related entities, and either creates new assignments or updates existing ones accordingly. Returns appropriate error responses for missing or invalid data.
 *
 * @returns A JSON response indicating success or providing an error message with the corresponding HTTP status code.
 */
export async function POST(request: Request) {
	let requestData;
	try {
		requestData = await request.json()
		const { class: className, amAssignments, pmAssignments, updateExisting } = requestData

		if (!className) {
			captureError(new Error('Class not found'), {
				location: 'api/schedule/teacher-assignments',
				type: 'fetch-assignments',
				extra: {
					searchParams: Object.fromEntries(new URL(request.url).searchParams)
				}
			})
			return NextResponse.json(
				{ error: 'Class parameter is required' },
				{ status: 400 }
			)
		}

		// First find the class by name
		const classRecord = await prisma.class.findUnique({
			where: { name: className }
		})

		if (!classRecord) {
			captureError(new Error('Class not found'), {
				location: 'api/schedule/teacher-assignments',
				type: 'fetch-assignments',
				extra: {
					searchParams: Object.fromEntries(new URL(request.url).searchParams)
				}
			})
			return NextResponse.json(
				{ error: 'Class not found' },
				{ status: 404 }
			)
		}

		// Check for existing assignments for this class
		const existingAssignments = await prisma.teacherAssignment.findMany({
			where: { classId: classRecord.id }
		})

		if (existingAssignments.length > 0 && !updateExisting) {
			return NextResponse.json(
				{ error: 'EXISTING_ASSIGNMENTS' },
				{ status: 409 }
			)
		}

		// Delete existing assignments if updating
		if (updateExisting) {
			await prisma.teacherAssignment.deleteMany({
				where: { classId: classRecord.id }
			})
		}

		// Process AM assignments
		for (const assignment of amAssignments) {
			const subject = await prisma.subject.findUnique({
				where: { name: assignment.subject }
			})
			const learningContent = await prisma.learningContent.findUnique({
				where: { name: assignment.learningContent }
			})
			const room = await prisma.room.findUnique({
				where: { name: assignment.room }
			})

			if (!subject || !learningContent || !room) {
				return NextResponse.json(
					{ error: 'Invalid subject, learning content, or room' },
					{ status: 400 }
				)
			}

			await prisma.teacherAssignment.create({
				data: {
					classId: classRecord.id,
					period: 'AM',
          groupId: assignment.groupId === 0 ? null : assignment.groupId,
					teacherId: assignment.teacherId,
					subjectId: subject.id,
					learningContentId: learningContent.id,
					roomId: room.id
				}
			})
		}

		// Process PM assignments
		for (const assignment of pmAssignments) {
			const subject = await prisma.subject.findUnique({
				where: { name: assignment.subject }
			})
			const learningContent = await prisma.learningContent.findUnique({
				where: { name: assignment.learningContent }
			})
			const room = await prisma.room.findUnique({
				where: { name: assignment.room }
			})

			if (!subject || !learningContent || !room) {
				return NextResponse.json(
					{ error: 'Invalid subject, learning content, or room' },
					{ status: 400 }
				)
			}

await prisma.teacherAssignment.create({
 				data: {
 					classId: classRecord.id,
 					period: 'PM',
					groupId: assignment.groupId === 0 ? null : assignment.groupId,
 					teacherId: assignment.teacherId,
 					subjectId: subject.id,
 					learningContentId: learningContent.id,
 					roomId: room.id
 				}
 			})
		}

		return NextResponse.json({ message: 'Teacher assignments saved successfully' })
	} catch (error) {
		
		captureError(error, {
			location: 'api/schedule/teacher-assignments',
			type: 'update-assignments',
			extra: {
				requestBody: JSON.stringify(requestData)
			}
		})
		return NextResponse.json(
			{ error: 'Failed to update teacher assignments' },
			{ status: 500 }
		)
	}
} 