import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'


/**
 * Retrieves teacher assignments for a specified class, grouped by AM and PM periods.
 *
 * Parses the `class` query parameter from the request URL, fetches the corresponding class and its teacher assignments from the database, and returns the assignments separated into `amAssignments` and `pmAssignments` arrays. Returns an error response if the class parameter is missing, the class is not found, or an unexpected error occurs.
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

		// Get the selected weekday from the first assignment (they should all have the same weekday)
		const selectedWeekday = assignments[0]?.selectedWeekday ?? 1

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
			pmAssignments,
			selectedWeekday
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
 * Creates or updates teacher assignments for a specified class based on the provided JSON payload.
 *
 * Validates the existence of the class and related entities (subject, learning content, room), and either creates new assignments or replaces existing ones depending on the `updateExisting` flag. Returns appropriate error responses for missing parameters, nonexistent entities, or assignment conflicts.
 *
 * @returns A JSON response indicating success, or an error message with the corresponding HTTP status code.
 */
export async function POST(request: Request) {
	let requestData;
	try {
		requestData = await request.json()
		const { class: className, amAssignments, pmAssignments, updateExisting, selectedWeekday } = requestData

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
					roomId: room.id,
					selectedWeekday: selectedWeekday ?? 1
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
					roomId: room.id,
					selectedWeekday: selectedWeekday ?? 1
				}
			})
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		captureError(error, {
			location: 'api/schedule/teacher-assignments',
			type: 'save-assignments',
			extra: {
				requestData
			}
		})
		return NextResponse.json(
			{ error: 'Failed to save teacher assignments' },
			{ status: 500 }
		)
	}
} 