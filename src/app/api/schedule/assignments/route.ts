import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'


interface Assignment {
	groupId: number
	studentIds: number[]
}



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
		console.error('Error fetching assignments:', error)
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

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { class: className, assignments, removedStudentIds } = body

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
		if (removedStudentIds.length > 0) {
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
		console.error('Error creating assignments:', error)
		captureError(error, {
			location: 'api/schedule/assignments',
			type: 'create-assignments',
			extra: {
				requestBody: await request.text()
			}
		})
		return NextResponse.json(
			{ error: 'Failed to create assignments' },
			{ status: 500 }
		)
	}
} 