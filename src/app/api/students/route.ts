import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { badRequest, conflict, created, notFound, ok, serverError } from '@/lib/api-response'
import { resolveSchoolYearId } from '@/lib/year-aware-class-staff'

interface CreateStudentRequest {
	firstName: string
	lastName: string
	username: string
	className: string
	schoolYearId?: number
}

/**
 * Retrieves all students belonging to a specified class for the current (or
 * requested) school year. Looks up class membership through ClassMembership
 * rather than the legacy Student.classId column.
 *
 * Expects a `class` query parameter in the request URL. Returns a JSON array
 * of students ordered by last name and first name.
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const className = searchParams.get('class')
	const schoolYearIdParam = searchParams.get('schoolYearId')

	if (!className) {
		return badRequest('Class parameter is required')
	}

	try {
		const classRecord = await prisma.class.findUnique({
			where: { name: className },
			select: { id: true, name: true, description: true }
		})

		if (!classRecord) {
			return ok([])
		}

		let schoolYearId: number | null = schoolYearIdParam ? Number(schoolYearIdParam) : null
		if (schoolYearId == null || Number.isNaN(schoolYearId)) {
			schoolYearId = await resolveSchoolYearId()
		}
		if (schoolYearId == null) {
			return ok([])
		}

		const memberships = await prisma.classMembership.findMany({
			where: { classId: classRecord.id, schoolYearId },
			select: { studentId: true }
		})
		const studentIds = memberships.map(m => m.studentId)
		const students =
			studentIds.length === 0
				? []
				: await prisma.student.findMany({
						where: { id: { in: studentIds } },
						orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
					})

		const isCombinedClass = classRecord.description?.includes('Combined class from') ?? false

		const processedStudents = students.map(student => {
			if (!student?.id) {
				console.warn('Invalid student data:', student)
				return null
			}

			const studentData: {
				id: number
				firstName: string
				lastName: string
				class: string
				username: string
				originalClass?: string
			} = {
				id: student.id,
				firstName: student.firstName ?? '',
				lastName: student.lastName ?? '',
				class: classRecord.name,
				username: student.username ?? ''
			}

			if (isCombinedClass) {
				const usernameRegex = /^([^_]+)_(.+)$/
				const usernameMatch = usernameRegex.exec(student.username ?? '')
				if (usernameMatch?.[1] && usernameMatch?.[2]) {
					const originalClass = usernameMatch[1]
					const actualUsername = usernameMatch[2]
					studentData.originalClass = originalClass
					studentData.username = actualUsername
				}
			}

			return studentData
		}).filter(Boolean)

		return ok(processedStudents)
	} catch (error) {
		console.error('Error in students API:', error)
		captureError(error, {
			location: 'api/students',
			type: 'fetch-students',
			extra: {
				searchParams: Object.fromEntries(searchParams)
			}
		})
		return serverError('Failed to fetch students')
	}
}

/**
 * Handles HTTP POST requests to create a new student record.
 *
 * Expects a JSON body containing `firstName`, `lastName`, `username`, and
 * `className` (and optionally `schoolYearId`). Class assignment is now
 * persisted via ClassMembership for the requested or current school year.
 */
export async function POST(request: Request) {
	let requestBody: CreateStudentRequest = {
		firstName: '',
		lastName: '',
		username: '',
		className: ''
	}
	try {
		requestBody = await request.json()
		const { firstName, lastName, username: rawUsername, className } = requestBody

		if (!firstName || !lastName || !rawUsername || !className) {
			return badRequest('Missing required fields')
		}
		const username = normalizeUsername(rawUsername)
		if (!username) {
			return badRequest('Username is required')
		}

		const existingStudent = await prisma.student.findUnique({
			where: { username }
		})

		if (existingStudent) {
			return conflict('Username already exists')
		}

		const classRecord = await prisma.class.findUnique({
			where: { name: className }
		})

		if (!classRecord) {
			return notFound('Class not found')
		}

		const schoolYearId = requestBody.schoolYearId ?? (await resolveSchoolYearId())
		if (schoolYearId == null) {
			return badRequest('No school year configured for this student')
		}

		const student = await prisma.student.create({
			data: {
				firstName,
				lastName,
				username
			}
		})

		await prisma.classMembership.upsert({
			where: { studentId_schoolYearId: { studentId: student.id, schoolYearId } },
			update: { classId: classRecord.id },
			create: { studentId: student.id, classId: classRecord.id, schoolYearId }
		})

		return created({
			...student,
			classId: classRecord.id
		})
	} catch (error) {
		captureError(error, {
			location: 'api/students',
			type: 'create-students',
			extra: {
				requestBody
			}
		})
		return serverError('Failed to create student')
	}
}
