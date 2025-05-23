import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'


const prisma = new PrismaClient()


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

		// Fetch existing assignments for this class
		const assignments = await prisma.teacherAssignment.findMany({
			where: { classId: classRecord.id },
			orderBy: [
				{ period: 'asc' },
				{ groupId: 'asc' }
			],
			include: {
				teacher: true,
				subject: true,
				learningContent: true,
				room: true
			}
		})

		// Group assignments by period
		const amAssignments = assignments
			.filter(a => a.period === 'AM')
			.map(a => ({
				groupId: a.groupId,
				teacherId: a.teacherId,
				subject: a.subject.name,
				learningContent: a.learningContent.name,
				room: a.room.name
			}))

		const pmAssignments = assignments
			.filter(a => a.period === 'PM')
			.map(a => ({
				groupId: a.groupId,
				teacherId: a.teacherId,
				subject: a.subject.name,
				learningContent: a.learningContent.name,
				room: a.room.name
			}))

		return NextResponse.json({
			amAssignments,
			pmAssignments
		})
	} catch (error) {
		console.error('Error fetching teacher assignments:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch teacher assignments' },
			{ status: 500 }
		)
	}
}

export async function POST(request: Request) {
	try {
		const data = await request.json()
		const { class: className, amAssignments, pmAssignments, updateExisting } = data

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

		// Check for existing assignments for this class
		const existingAssignments = await prisma.teacherAssignment.findMany({
			where: { classId: classRecord.id }
		})

		if (existingAssignments.length > 0 && !updateExisting) {
			return NextResponse.json(
				{ error: 'EXISTING_ASSIGNMENTS' },
				{ status: 409 }
			)
		}

		// Delete existing assignments if updating
		if (updateExisting) {
			await prisma.teacherAssignment.deleteMany({
				where: { classId: classRecord.id }
			})
		}

		// Process AM assignments
		for (const assignment of amAssignments) {
			const subject = await prisma.subject.findUnique({
				where: { name: assignment.subject }
			})
			const learningContent = await prisma.learningContent.findUnique({
				where: { name: assignment.learningContent }
			})
			const room = await prisma.room.findUnique({
				where: { name: assignment.room }
			})

			if (!subject || !learningContent || !room) {
				return NextResponse.json(
					{ error: 'Invalid subject, learning content, or room' },
					{ status: 400 }
				)
			}

			await prisma.teacherAssignment.create({
				data: {
					classId: classRecord.id,
					period: 'AM',
					groupId: assignment.groupId,
					teacherId: assignment.teacherId,
					subjectId: subject.id,
					learningContentId: learningContent.id,
					roomId: room.id
				}
			})
		}

		// Process PM assignments
		for (const assignment of pmAssignments) {
			const subject = await prisma.subject.findUnique({
				where: { name: assignment.subject }
			})
			const learningContent = await prisma.learningContent.findUnique({
				where: { name: assignment.learningContent }
			})
			const room = await prisma.room.findUnique({
				where: { name: assignment.room }
			})

			if (!subject || !learningContent || !room) {
				return NextResponse.json(
					{ error: 'Invalid subject, learning content, or room' },
					{ status: 400 }
				)
			}

			await prisma.teacherAssignment.create({
				data: {
					classId: classRecord.id,
					period: 'PM',
					groupId: assignment.groupId,
					teacherId: assignment.teacherId,
					subjectId: subject.id,
					learningContentId: learningContent.id,
					roomId: room.id
				}
			})
		}

		return NextResponse.json({ message: 'Teacher assignments saved successfully' })
	} catch (error) {
		console.error('Error storing teacher assignments:', error)
		return NextResponse.json(
			{ error: 'Failed to store teacher assignments' },
			{ status: 500 }
		)
	}
} 