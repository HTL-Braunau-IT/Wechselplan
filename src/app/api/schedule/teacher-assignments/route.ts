import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

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
	updateExisting?: boolean
}

interface ApiError {
	error: string
	message: string
}

type TeacherAssignmentWithPeriod = {
	id: number
	class: string
	period: 'AM' | 'PM'
	groupId: number
	teacherId: number
	subject: string
	learningContent: string
	room: string
	createdAt: Date
	updatedAt: Date
}

export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url)
		const className = searchParams.get('class')

		if (!className) {
			return NextResponse.json(
				{ error: 'MISSING_PARAMETERS', message: 'Class is required' },
				{ status: 400 }
			)
		}

		// Fetch existing assignments for this class
		const assignments = await prisma.teacherAssignment.findMany({
			where: { class: className },
			orderBy: [
				{ period: 'asc' },
				{ groupId: 'asc' }
			]
		}) as TeacherAssignmentWithPeriod[]

		// Separate AM and PM assignments
		const amAssignments = assignments
			.filter((a): a is TeacherAssignmentWithPeriod & { period: 'AM' } => a.period === 'AM')
			.map(a => ({
				groupId: a.groupId,
				teacherId: a.teacherId,
				subject: a.subject,
				learningContent: a.learningContent,
				room: a.room
			}))

		const pmAssignments = assignments
			.filter((a): a is TeacherAssignmentWithPeriod & { period: 'PM' } => a.period === 'PM')
			.map(a => ({
				groupId: a.groupId,
				teacherId: a.teacherId,
				subject: a.subject,
				learningContent: a.learningContent,
				room: a.room
			}))

		return NextResponse.json({
			amAssignments,
			pmAssignments
		})
	} catch (error) {
		console.error('Error fetching teacher assignments:', error)
		return NextResponse.json(
			{ error: 'INTERNAL_ERROR', message: 'Failed to fetch teacher assignments' },
			{ status: 500 }
		)
	}
}

export async function POST(request: Request) {
	try {
		const body = await request.json()
		console.log('Received request body:', JSON.stringify(body, null, 2))

		const { class: className, amAssignments = [], pmAssignments = [], updateExisting = false } = body as RequestBody

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
		}) as TeacherAssignmentWithPeriod[]

		// If there are existing assignments and updateExisting is false, return error
		if (existingAssignments.length > 0 && !updateExisting) {
			return NextResponse.json(
				{ error: 'EXISTING_ASSIGNMENTS', message: 'There are existing teacher assignments for this class.' },
				{ status: 409 }
			)
		}

		// If updating existing assignments, delete all existing assignments first
		if (updateExisting) {
			await prisma.teacherAssignment.deleteMany({
				where: { class: className }
			})
		}

		// Create new assignments in bulk
		await prisma.teacherAssignment.createMany({
			data: assignments.map(assignment => ({
				class: className,
				period: assignment.period,
				groupId: assignment.groupId,
				teacherId: assignment.teacherId,
				subject: assignment.subject,
				learningContent: assignment.learningContent,
				room: assignment.room
			}))
		})

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error storing teacher assignments:', error)
		return NextResponse.json(
			{ error: 'INTERNAL_ERROR', message: 'Failed to store teacher assignments' },
			{ status: 500 }
		)
	}
} 