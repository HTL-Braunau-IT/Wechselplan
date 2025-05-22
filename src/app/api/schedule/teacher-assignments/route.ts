import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

interface TeacherAssignment {
	groupId: number
	teacherId: number
	subject: string
	learningContent: string
	room: string
}

interface RequestBody {
	class: string
	amAssignments: TeacherAssignment[]
	pmAssignments: TeacherAssignment[]
}

export async function POST(request: Request) {
	try {
		const body = await request.json() as RequestBody
		const { class: className, amAssignments, pmAssignments } = body

		// Start a transaction to ensure all operations succeed or fail together
		await prisma.$transaction(async (tx) => {
			// Delete existing teacher assignments for this class
			await tx.teacherAssignment.deleteMany({
				where: { class: className }
			})

			// Create new teacher assignments
			const allAssignments = [
				...amAssignments.map(assignment => ({
					...assignment,
					period: 'AM' as const
				})),
				...pmAssignments.map(assignment => ({
					...assignment,
					period: 'PM' as const
				}))
			]

			await tx.teacherAssignment.createMany({
				data: allAssignments.map(assignment => ({
					class: className,
					groupId: assignment.groupId,
					teacherId: assignment.teacherId,
					subject: assignment.subject,
					learningContent: assignment.learningContent,
					room: assignment.room,
					period: assignment.period
				}))
			})
		})

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error storing teacher assignments:', error)
		return NextResponse.json(
			{ error: 'Failed to store teacher assignments' },
			{ status: 500 }
		)
	}
} 