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

		// Get all students with their group assignments for this class
		const students = await prisma.student.findMany({
			where: { class: className },
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
		const body = await request.json() as RequestBody
		const { class: className, assignments, removedStudentIds, updateExisting } = body

		// Check if there are existing assignments for this class
		const existingAssignment = await prisma.groupAssignment.findFirst({
			where: { class: className }
		})

		if (existingAssignment && !updateExisting) {
			return NextResponse.json(
				{ error: 'EXISTING_ASSIGNMENTS', message: 'There are existing group assignments for this class.' },
				{ status: 409 }
			)
		}

		// Start a transaction to ensure all operations succeed or fail together
		await (prisma as unknown as { $transaction: (callback: (tx: TransactionClient) => Promise<void>, options?: { isolationLevel: Prisma.TransactionIsolationLevel }) => Promise<void> }).$transaction(async (tx: TransactionClient) => {
			// If updating existing assignments, delete all existing assignments for this class
			if (updateExisting) {
				await tx.groupAssignment.deleteMany({
					where: { class: className }
				})
			}

			// Remove students that were removed from groups
			if (removedStudentIds.length > 0) {
				await tx.student.deleteMany({
					where: {
						id: {
							in: removedStudentIds
						}
					}
				})
			}

			// Store group assignments
			for (const assignment of assignments) {
				// Create the group assignment
				await tx.groupAssignment.create({
					data: {
						groupId: assignment.groupId,
						class: className
					}
				})

				// Update students with their group ID
				await tx.student.updateMany({
					where: {
						id: {
							in: assignment.studentIds
						}
					},
					data: {
						groupId: assignment.groupId
					}
				})
			}
		}, {
			isolationLevel: Prisma.TransactionIsolationLevel.Serializable
		})

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error storing assignments:', error)
		return NextResponse.json(
			{ error: 'Failed to store assignments' },
			{ status: 500 }
		)
	}
} 