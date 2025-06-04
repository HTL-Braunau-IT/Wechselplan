import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
	request: Request,
	context: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await context.params
		const studentId = parseInt(id)
		
		if (isNaN(studentId)) {
			return NextResponse.json(
				{ error: 'Invalid student ID' },
				{ status: 400 }
			)
		}

		// Delete the student
		await prisma.student.delete({
			where: { id: studentId }
		})

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error deleting student:', error)
		return NextResponse.json(
			{ error: 'Failed to delete student' },
			{ status: 500 }
		)
	}
} 