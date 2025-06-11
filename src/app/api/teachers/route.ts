import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { z } from 'zod'

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
 * Retrieves a list of all teachers with basic information.
 *
 * Returns an array of teachers, each containing the `id`, `firstName`, `lastName`, and `username` fields, ordered by last name in ascending order.
 *
 * @returns A JSON response containing the list of teachers or an error message with status 500 if retrieval fails.
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

		return NextResponse.json(teachers)
	} catch (error) {
		console.error('Error fetching teachers:', error)
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
 * Validates the incoming request body against the teacher schema, checks for username uniqueness, and creates a new teacher in the database if validation passes.
 *
 * @returns A JSON response containing the created teacher object, or an error message with appropriate HTTP status code if validation or creation fails.
 */
export async function POST(request: Request) {
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

		// Check for username uniqueness
		const existingTeacher = await prisma.teacher.findUnique({
			where: { username: requestBody.username }
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
				username: requestBody.username,
				email: requestBody.email
			}
		})
		return NextResponse.json(teacher)
	} catch (error) {
		console.error('Error creating teacher:', error)
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