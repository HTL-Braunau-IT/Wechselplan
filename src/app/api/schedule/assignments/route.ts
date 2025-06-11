import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

interface Assignment {
	groupId: number
	studentIds: number[]
}

interface RequestBody {
	class: string
	assignments: Assignment[]
	removedStudentIds?: number[]
}

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const className = searchParams.get('class')

		if (!className) {
			captureError(new Error('Class parameter is required'), {
				location: 'api/schedule/assignments',
				type: 'validation-error',
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
				location: 'api/schedule/assignments',
				type: 'not-found',
				extra: {
					className,
					searchParams: Object.fromEntries(new URL(request.url).searchParams)
				}
			})
			return NextResponse.json(
				{ error: 'Class not found' },
				{ status: 404 }
			)
		}

		// Get all students with their group assignments for this class
		const students = await prisma.student.findMany({
			where: {
				classId: classRecord.id
			},
			orderBy: [
				{ lastName: 'asc' },
				{ firstName: 'asc' }
			]
		})

		// Group students by their groupId
		const groups = new Map<number, typeof students>()
		students.forEach(student => {
			if (student.groupId) {
				if (!groups.has(student.groupId as number)) {
					groups.set(student.groupId as number, [])
				}
				groups.get(student.groupId as number)!.push(student)
			}
		})

		// Convert to the expected format
		const assignments: Assignment[] = Array.from(groups.entries()).map(([groupId, students]) => ({
			groupId,
			studentIds: students.map((s: { id: number }) => s.id)
		}))

		return NextResponse.json({
			assignments,
			unassignedStudents: students.filter(s => !s.groupId)
		})
	} catch (error) {
		
		captureError(error, {
			location: 'api/schedule/assignments',
			type: 'fetch-assignments',
			extra: {
				searchParams: Object.fromEntries(new URL(request.url).searchParams)
			}
		})
		return NextResponse.json(
			{ error: 'Failed to fetch assignments' },
			{ status: 500 }
		)
	}
}

/**
 * Updates student group assignments for a specified class.
 *
 * Accepts a JSON payload containing the class name, an array of group assignments, and an optional array of student IDs to unassign. Updates each student's group assignment in the database accordingly, unassigning students when `groupId` is 0 or when listed in `removedStudentIds`. Returns a JSON response indicating success or an error message with the appropriate HTTP status code.
 */
export async function POST(request: Request) {
	let rawBody = ''
	try {
		// Capture raw body once so it can be reused in error reporting
		rawBody = await request.text()
		let body: RequestBody
		try {
			body = JSON.parse(rawBody)
		} catch (error) {
			captureError(new Error('Invalid request body'), {
				location: 'api/schedule/assignments',
				type: 'validation-error',
				extra: { requestBody: rawBody }
			})
			return NextResponse.json(
				{ error: 'Invalid request body' },
				{ status: 400 }
			)
		}

		const { class: className, assignments, removedStudentIds } = body

		if (!className) {
			captureError(new Error('Class parameter is required'), {
				location: 'api/schedule/assignments',
				type: 'validation-error',
				extra: { requestBody: rawBody }
			})
			return NextResponse.json(
				{ error: 'Class parameter is required' },
				{ status: 400 }
			)
		}

		if (!Array.isArray(assignments)) {
			captureError(new Error('Assignments must be an array'), {
				location: 'api/schedule/assignments',
				type: 'validation-error',
				extra: { requestBody: rawBody }
			})
			return NextResponse.json(
				{ error: 'Assignments must be an array' },
				{ status: 400 }
			)
		}

		// Validate each assignment
		for (const assignment of assignments) {
			if (!assignment.studentIds) {
				captureError(new Error('Each assignment must have studentIds'), {
					location: 'api/schedule/assignments',
					type: 'validation-error',
					extra: { requestBody: rawBody }
				})
				return NextResponse.json(
					{ error: 'Each assignment must have studentIds' },
					{ status: 400 }
				)
			}

			if (typeof assignment.groupId !== 'number') {
				captureError(new Error('groupId must be a number'), {
					location: 'api/schedule/assignments',
					type: 'validation-error',
					extra: { requestBody: rawBody }
				})
				return NextResponse.json(
					{ error: 'groupId must be a number' },
					{ status: 400 }
				)
			}
		}

		// First find the class by name
		const classRecord = await prisma.class.findUnique({
			where: { name: className }
		})

		if (!classRecord) {
			captureError(new Error('Class not found'), {
				location: 'api/schedule/assignments',
				type: 'not-found',
				extra: {
					className,
					requestBody: rawBody
				}
			})
			return NextResponse.json(
				{ error: 'Class not found' },
				{ status: 404 }
			)
		}

		// Update each student's groupId
		for (const assignment of assignments) {
			// Skip the unassigned group (groupId: 0)
			if (assignment.groupId === 0) {
				await prisma.student.updateMany({
					where: {
						id: { in: assignment.studentIds }
					},
					data: {
						groupId: null
					}
				})
			} else {
				await prisma.student.updateMany({
					where: {
						id: { in: assignment.studentIds }
					},
					data: {
						groupId: assignment.groupId
					}
				})
			}
		}

		// Remove groupId from removed students (this is now handled by the unassigned group)
		if (Array.isArray(removedStudentIds) && removedStudentIds.length > 0) {
			await prisma.student.updateMany({
				where: {
					id: { in: removedStudentIds }
				},
				data: {
					groupId: null
				}
			})
		}

		return NextResponse.json({ success: true })
	} catch (error) {

		captureError(error, {
			location: 'api/schedule/assignments',
			type: 'create-assignments',
			extra: { requestBody: rawBody }
		})
		return NextResponse.json(
			{ error: 'Failed to create assignments' },
			{ status: 500 }
		)
	}
} 