import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { z } from 'zod'
import { badRequest, conflict, created, ok, serverError, unprocessable } from '@/lib/api-response'

const teacherSchema = z.object({
	firstName: z.string().min(1, 'First name is required').trim(),
	lastName: z.string().min(1, 'Last name is required').trim(),
	username: z.string()
		.min(3, 'Username must be at least 3 characters')
		.max(50, 'Username must be less than 50 characters')
		.trim()
		.toLowerCase(),
	email: z.string().email('Invalid email address').trim().toLowerCase()
})

/**
 * Handles HTTP GET requests to retrieve all teachers with basic information.
 *
 * Returns a JSON array of teachers, each including `id`, `firstName`, `lastName`, and `username`, ordered by last name ascending. On failure, returns a JSON error message with status 500.
 */
export async function GET() {
	try {
		const teachers = await prisma.teacher.findMany({
			select: {
				id: true,
				firstName: true,
				lastName: true,
				username: true
			},
			orderBy: {
				lastName: 'asc'
			}
		})

		return ok(teachers)
	} catch (error) {

		captureError(error, {
			location: 'api/teachers',
			type: 'fetch-teachers'
		})
		return serverError('Failed to fetch teachers')
	}
}

/**
 * Handles HTTP POST requests to create a new teacher record.
 *
 * Validates the request body against the teacher schema, ensures the username is unique, and creates a new teacher in the database if all checks pass.
 *
 * @returns A JSON response containing the created teacher object, or an error message with an appropriate HTTP status code if validation or creation fails.
 */
export async function POST(request: Request) {
	if (!prisma) {
		return serverError('Database not initialized')
	}

	let requestBody: z.infer<typeof teacherSchema> = {
		firstName: '',
		lastName: '',
		username: '',
		email: ''
	}
	try {
		const rawBody = await request.json()
		const validationResult = teacherSchema.safeParse(rawBody)
		
		if (!validationResult.success) {
			return unprocessable('Validation failed', validationResult.error.format())
		}

		requestBody = validationResult.data
		const username = normalizeUsername(requestBody.username)
		if (!username) {
			return badRequest('Username is required')
		}

		// Check for username uniqueness
		const existingTeacher = await prisma.teacher.findUnique({
			where: { username }
		})

		if (existingTeacher) {
			return conflict('Username already exists')
		}

		const teacher = await prisma.teacher.create({
			data: {
				firstName: requestBody.firstName,
				lastName: requestBody.lastName,
				username,
				email: requestBody.email
			}
		})
		return created(teacher)
	} catch (error) {

		captureError(error, {
			location: 'api/teachers',
			type: 'create-teachers',
			extra: {
				requestBody
			}
		})
		return serverError('Failed to create teacher')
	}
} 