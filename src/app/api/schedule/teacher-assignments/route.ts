import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma, TeacherAssignment as PrismaTeacherAssignment } from '@prisma/client'

interface TeacherAssignment {
	period: 'AM' | 'PM'
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
		const body = await request.json()
		console.log('Received request body:', JSON.stringify(body, null, 2))

		const { class: className, amAssignments = [], pmAssignments = [] } = body as RequestBody

		if (!className) {
			console.log('Missing class name')
			return NextResponse.json(
				{ error: 'MISSING_PARAMETERS', message: 'Class is required' },
				{ status: 400 }
			)
		}

		// Filter out assignments with no teacher selected (teacherId === 0)
		const validAmAssignments = amAssignments.filter(a => a.teacherId !== 0)
		const validPmAssignments = pmAssignments.filter(a => a.teacherId !== 0)

		// Combine AM and PM assignments
		const assignments = [
			...validAmAssignments.map(a => ({ ...a, period: 'AM' as const })),
			...validPmAssignments.map(a => ({ ...a, period: 'PM' as const }))
		]

		console.log('Processed assignments:', JSON.stringify(assignments, null, 2))

		// If no valid assignments, return success
		if (assignments.length === 0) {
			return NextResponse.json({ success: true })
		}

		// Get all unique teacher IDs from assignments
		const teacherIds = [...new Set(assignments.map(a => a.teacherId))]

		// Check if all teachers exist
		const existingTeachers = await prisma.teacher.findMany({
			where: { id: { in: teacherIds } },
			select: { id: true }
		})

		const existingTeacherIds = new Set(existingTeachers.map(t => t.id))
		const invalidTeacherIds = teacherIds.filter(id => !existingTeacherIds.has(id))

		if (invalidTeacherIds.length > 0) {
			console.log('Invalid teacher IDs:', invalidTeacherIds)
			return NextResponse.json(
				{ 
					error: 'INVALID_TEACHERS', 
					message: 'Some teachers do not exist',
					invalidTeacherIds 
				},
				{ status: 400 }
			)
		}

		// Check for existing assignments for this class
		const existingAssignments = await prisma.teacherAssignment.findMany({
			where: { class: className }
		}) as PrismaTeacherAssignment[]

		// Create a map of existing assignments for quick lookup
		const existingAssignmentMap = new Map(
			existingAssignments.map(assignment => [
				`${assignment.period}-${assignment.groupId}`,
				assignment
			])
		)

		// Process assignments and check for conflicts
		const newAssignments: Prisma.TeacherAssignmentCreateManyInput[] = []

		for (const assignment of assignments) {
			const key = `${assignment.period}-${assignment.groupId}`
			const existingAssignment = existingAssignmentMap.get(key)

			if (existingAssignment) {
				// Update existing assignment
				await prisma.teacherAssignment.update({
					where: { id: existingAssignment.id },
					data: {
						teacherId: assignment.teacherId,
						subject: assignment.subject,
						learningContent: assignment.learningContent,
						room: assignment.room
					}
				})
			} else {
				// Create new assignment
				newAssignments.push({
					class: className,
					period: assignment.period,
					groupId: assignment.groupId,
					teacherId: assignment.teacherId,
					subject: assignment.subject,
					learningContent: assignment.learningContent,
					room: assignment.room
				})
			}
		}

		// Create new assignments in bulk
		if (newAssignments.length > 0) {
			await prisma.teacherAssignment.createMany({
				data: newAssignments
			})
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error storing teacher assignments:', error)
		return NextResponse.json(
			{ error: 'INTERNAL_ERROR', message: 'Failed to store teacher assignments' },
			{ status: 500 }
		)
	}
} 