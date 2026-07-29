import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { z } from 'zod'
import { denyUnlessAccess } from '@/lib/api-guard'

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
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

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

		return NextResponse.json(teachers)
	} catch (error) {

		captureError(error, {
			location: 'api/teachers',
			type: 'fetch-teachers'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch teachers' },
			{ status: 500 }
		)
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
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

	if (!prisma) {
		return NextResponse.json({ error: 'Database not initialized' }, { status: 500 })
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
			return NextResponse.json(
				{ error: 'Validation failed', details: validationResult.error.format() },
				{ status: 400 }
			)
		}

		requestBody = validationResult.data
		const username = normalizeUsername(requestBody.username)
		if (!username) {
			return NextResponse.json(
				{ error: 'Username is required' },
				{ status: 400 }
			)
		}

		// Check for username uniqueness
		const existingTeacher = await prisma.teacher.findUnique({
			where: { username }
		})

		if (existingTeacher) {
			return NextResponse.json(
				{ error: 'Username already exists' },
				{ status: 400 }
			)
		}

		const teacher = await prisma.teacher.create({
			data: {
				firstName: requestBody.firstName,
				lastName: requestBody.lastName,
				username,
				email: requestBody.email
			}
		})
		return NextResponse.json(teacher)
	} catch (error) {

		captureError(error, {
			location: 'api/teachers',
			type: 'create-teachers',
			extra: {
				requestBody
			}
		})
		return NextResponse.json({ error: 'Failed to create teacher' }, { status: 500 })
	}
} 