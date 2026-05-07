import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { badRequest, conflict, notFound, ok, serverError } from '@/lib/api-response'


/**
 * Handles GET requests to retrieve teacher assignments for a specified class, grouped by AM and PM periods.
 *
 * Extracts the `classId` and optional `selectedWeekday` query parameters from the request URL, fetches the corresponding class and its teacher assignments from the database, and returns the assignments separated into `amAssignments` and `pmAssignments` arrays, along with the `selectedWeekday` value. If `selectedWeekday` is provided, assignments are filtered by that weekday.
 *
 * @returns A JSON response containing `amAssignments`, `pmAssignments`, and `selectedWeekday`, or an error message with the appropriate HTTP status code if the class is not specified, not found, or an unexpected error occurs.
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const classIdParam = searchParams.get('classId')
		const selectedWeekdayParam = searchParams.get('selectedWeekday')
		const schoolYearIdParam = searchParams.get('schoolYearId')

		if (!classIdParam) {
			return badRequest('Class ID parameter is required')
		}

		const classId = parseInt(classIdParam, 10)
		if (isNaN(classId)) {
			return badRequest('Class ID must be a number')
		}

		// Find the class by ID
		const classRecord = await prisma.class.findUnique({
			where: { id: classId }
		})

		if (!classRecord) {
			captureError(new Error('Class not found'), {
				location: 'api/schedules/teacher-assignments',
				type: 'fetch-assignments',
				extra: {
					searchParams: Object.fromEntries(new URL(request.url).searchParams)
				}
			})
			return notFound('Class not found')
		}

		// Resolve school year: from query or current
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
			return badRequest('No school year found.')
		}

		// Build where clause with optional weekday filter
		const whereClause: { classId: number; schoolYearId: number; selectedWeekday?: number } = {
			classId: classRecord.id,
			schoolYearId
		}
		if (selectedWeekdayParam) {
			const weekday = parseInt(selectedWeekdayParam, 10)
			if (!isNaN(weekday)) {
				whereClause.selectedWeekday = weekday
			}
		}

		// Fetch existing assignments for this class and school year, optionally filtered by weekday
		const assignments = await prisma.teacherAssignment.findMany({
			where: whereClause,
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

		// Get the selected weekday from the first assignment or the parameter
		const selectedWeekday = selectedWeekdayParam ? parseInt(selectedWeekdayParam, 10) : (assignments[0]?.selectedWeekday ?? 1)

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

		return ok({
			amAssignments,
			pmAssignments,
			selectedWeekday
		})
	} catch (error) {
		captureError(error, {
			location: 'api/schedules/teacher-assignments',
			type: 'fetch-assignments',
			extra: {
				searchParams: Object.fromEntries(new URL(request.url).searchParams)
			}
		})
		return serverError('Failed to fetch teacher assignments')
	}
}

/**
 * Creates or updates teacher assignments for a specified class using data from the request body.
 *
 * Validates the existence of the class and related entities (subject, learning content, room), and either creates new assignments or replaces existing ones based on the `updateExisting` flag. Stores the `selectedWeekday` value with each assignment, defaulting to 1 if not provided.
 *
 * @returns A JSON response with `{ success: true }` on success, or an error message with the appropriate HTTP status code if validation fails or an error occurs.
 */
export async function POST(request: Request) {
	let requestData: Record<string, unknown> = {};
	try {
		requestData = await request.json()
		const {
			classId,
			amAssignments,
			pmAssignments,
			updateExisting,
			selectedWeekday,
			schoolYearId: bodySchoolYearId
		} = requestData as {
			classId?: unknown
			amAssignments: Array<{
				groupId: number
				teacherId: number
				subject: string
				learningContent: string
				room: string
			}>
			pmAssignments: Array<{
				groupId: number
				teacherId: number
				subject: string
				learningContent: string
				room: string
			}>
			updateExisting?: boolean
			selectedWeekday?: unknown
			schoolYearId?: unknown
		}

		if (!classId || typeof classId !== 'number') {
			captureError(new Error('Class ID parameter is required'), {
				location: 'api/schedules/teacher-assignments',
				type: 'fetch-assignments',
				extra: {
					searchParams: Object.fromEntries(new URL(request.url).searchParams)
				}
			})
			return badRequest('Class ID parameter is required')
		}

		// Find the class by ID
		const classRecord = await prisma.class.findUnique({
			where: { id: classId }
		})

		if (!classRecord) {
			captureError(new Error('Class not found'), {
				location: 'api/schedules/teacher-assignments',
				type: 'fetch-assignments',
				extra: {
					searchParams: Object.fromEntries(new URL(request.url).searchParams)
				}
			})
			return notFound('Class not found')
		}

		// Resolve school year: from body or current
		let schoolYearId = typeof bodySchoolYearId === 'number' ? bodySchoolYearId : undefined
		if (schoolYearId == null) {
			const now = new Date()
			const current = await prisma.schoolYear.findFirst({
				where: { startDate: { lte: now }, endDate: { gte: now } },
				select: { id: true }
			})
			schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
		}
		if (schoolYearId == null) {
			return badRequest('No school year found. Create a school year in Admin / Data / School Years first.')
		}

		const weekdayForStore = (typeof selectedWeekday === 'number' && selectedWeekday >= 1 && selectedWeekday <= 5
			? selectedWeekday
			: 1) as number

		const existingForWeekday = await prisma.teacherAssignment.findMany({
			where: { classId: classRecord.id, schoolYearId, selectedWeekday: weekdayForStore }
		})

		if (existingForWeekday.length > 0 && !updateExisting) {
			return conflict('EXISTING_ASSIGNMENTS')
		}

		if (updateExisting) {
			await prisma.teacherAssignment.deleteMany({
				where: { classId: classRecord.id, schoolYearId, selectedWeekday: weekdayForStore }
			})
		}

		const upsertLookup = (kind: 'SUBJECT' | 'LEARNING_CONTENT' | 'ROOM', name: string) =>
			prisma.lookupValue.upsert({
				where: { kind_name: { kind, name } },
				update: {},
				create: { kind, name, isCustom: true }
			})

		const writeAssignment = async (
			assignment: { groupId: number; teacherId: number; subject: string; learningContent: string; room: string },
			period: 'AM' | 'PM'
		) => {
			const [subject, learningContent, room] = await Promise.all([
				upsertLookup('SUBJECT', assignment.subject),
				upsertLookup('LEARNING_CONTENT', assignment.learningContent),
				upsertLookup('ROOM', assignment.room)
			])

			await prisma.teacherAssignment.create({
				data: {
					classId: classRecord.id,
					schoolYearId,
					period,
					groupId: assignment.groupId,
					teacherId: assignment.teacherId,
					subjectId: subject.id,
					learningContentId: learningContent.id,
					roomId: room.id,
					selectedWeekday: weekdayForStore
				}
			})
		}

		for (const assignment of amAssignments) {
			await writeAssignment(assignment, 'AM')
		}

		for (const assignment of pmAssignments) {
			await writeAssignment(assignment, 'PM')
		}

		return ok(null, 'Teacher assignments saved successfully')
	} catch (error) {
		captureError(error, {
			location: 'api/schedules/teacher-assignments',
			type: 'save-assignments',
			extra: {
				requestData
			}
		})
		return serverError('Failed to save teacher assignments')
	}
}

