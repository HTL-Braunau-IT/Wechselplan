import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

interface CreateStudentRequest {
	firstName: string
	lastName: string
	username: string
	className: string
}

/**
 * Handles GET requests to retrieve all students belonging to a specified class.
 *
 * Expects a `class` query parameter in the request URL. Returns a JSON array of students ordered by last name and first name. Responds with a 400 error if the `class` parameter is missing, or a 500 error if the database query fails.
 *
 * @returns A JSON response containing the list of students or an error message.
 */
export async function GET(request: Request) {
	const { searchParams } = new URL(request.url)
	const className = searchParams.get('class')

	if (!className) {
		return NextResponse.json(
			{ error: 'Class parameter is required' },
			{ status: 400 }
		)
	}

	try {
		const students = await prisma.student.findMany({
			where: {
				class: {
					name: className
				}
			},
			orderBy: [
				{ lastName: 'asc' },
				{ firstName: 'asc' }
			]
		})

		return NextResponse.json(students)
	} catch (error) {
		console.error('Error fetching students:', error)
		captureError(error, {
			location: 'api/students',
			type: 'fetch-students',
			extra: {
				searchParams: Object.fromEntries(searchParams)
			}
		})
		return NextResponse.json(
			{ error: 'Failed to fetch students' },
			{ status: 500 }
		)
	}
}

/**
 * Handles HTTP POST requests to create a new student record.
 *
 * Expects a JSON body with `firstName`, `lastName`, `username`, and `className`. Validates required fields, ensures the username is unique, and associates the student with an existing class. Returns the created student as JSON, or an error response if validation fails or an error occurs.
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
		const { firstName, lastName, username, className } = requestBody

		if (!firstName || !lastName || !username || !className) {
			return NextResponse.json(
				{ error: 'Missing required fields' },
				{ status: 400 }
			)
		}

		// Check if username already exists
		const existingStudent = await prisma.student.findUnique({
			where: { username }
		})

		if (existingStudent) {
			return NextResponse.json(
				{ error: 'Username already exists' },
				{ status: 400 }
			)
		}

		// Get the class ID from the class name
		const classRecord = await prisma.class.findUnique({
			where: { name: className }
		})

		if (!classRecord) {
			return NextResponse.json(
				{ error: 'Class not found' },
				{ status: 404 }
			)
		}

		// Create the new student
		const student = await prisma.student.create({
			data: {
				firstName,
				lastName,
				username,
				classId: classRecord.id
			}
		})

		return NextResponse.json(student)
	} catch (error) {
		console.error('Error creating student:', error)
		captureError(error, {
			location: 'api/students',
			type: 'create-students',
			extra: {
				requestBody
			}
		})
		return NextResponse.json(
			{ error: 'Failed to create student' },
			{ status: 500 }
		)
	}
} 