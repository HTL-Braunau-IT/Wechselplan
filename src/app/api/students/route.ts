import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

// GET /api/students?class=1AHITS - Get all students for a class
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

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { firstName, lastName, username, className } = body

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
				requestBody: await request.text()
			}
		})
		return NextResponse.json(
			{ error: 'Failed to create student' },
			{ status: 500 }
		)
	}
} 