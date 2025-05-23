import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

interface Assignment {
	groupId: number
	studentIds: number[]
}

interface RequestBody {
	class: string
	assignments: Assignment[]
	removedStudentIds: number[]
	updateExisting?: boolean
}

type TransactionClient = {
	student: {
		deleteMany: (args: { where: { id: { in: number[] } } }) => Promise<Prisma.BatchPayload>
		updateMany: (args: { where: { id: { in: number[] } }, data: { groupId: number | null } }) => Promise<Prisma.BatchPayload>
		findMany: (args: { where: { class: string }, include?: { groupAssignment: true } }) => Promise<Array<{ id: number, firstName: string, lastName: string, class: string, groupId: number | null }>>
	}
	groupAssignment: {
		create: (args: { data: { groupId: number; class: string } }) => Promise<{ id: number }>
		deleteMany: (args: { where: { class: string } }) => Promise<Prisma.BatchPayload>
		findFirst: (args: { where: { class: string } }) => Promise<{ id: number } | null>
	}
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
				if (!groups.has(student.groupId)) {
					groups.set(student.groupId, [])
				}
				groups.get(student.groupId)!.push(student)
			}
		})

		// Convert to the expected format
		const assignments = Array.from(groups.entries()).map(([groupId, students]) => ({
			groupId,
			studentIds: students.map(s => s.id)
		}))

		return NextResponse.json({
			assignments,
			unassignedStudents: students.filter(s => !s.groupId)
		})
	} catch (error) {
		console.error('Error fetching assignments:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch assignments' },
			{ status: 500 }
		)
	}
}

export async function POST(request: Request) {
	try {
		const body = await request.json()
		const { class: className, assignments, removedStudentIds, updateExisting = false } = body

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
			await prisma.student.updateMany({
				where: {
					id: { in: assignment.studentIds }
				},
				data: {
					groupId: assignment.groupId
				}
			})
		}

		// Remove groupId from removed students
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
		console.error('Error storing assignments:', error)
		return NextResponse.json(
			{ error: 'Failed to store assignments' },
			{ status: 500 }
		)
	}
} 