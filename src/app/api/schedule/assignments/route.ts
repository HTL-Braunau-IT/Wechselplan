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
}

type TransactionClient = {
	student: {
		deleteMany: (args: { where: { id: { in: number[] } } }) => Promise<Prisma.BatchPayload>
		updateMany: (args: { where: { id: { in: number[] } }, data: { groupId: number | null } }) => Promise<Prisma.BatchPayload>
	}
	groupAssignment: {
		create: (args: { data: { groupId: number; class: string } }) => Promise<{ id: number }>
	}
}

export async function POST(request: Request) {
	try {
		const body = await request.json() as RequestBody
		const { class: className, assignments, removedStudentIds } = body

		// Start a transaction to ensure all operations succeed or fail together
		await (prisma as unknown as { $transaction: (callback: (tx: TransactionClient) => Promise<void>, options?: { isolationLevel: Prisma.TransactionIsolationLevel }) => Promise<void> }).$transaction(async (tx: TransactionClient) => {
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