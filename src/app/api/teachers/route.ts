import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
	try {
		const teachers = await prisma.teacher.findMany({
			select: {
				id: true,
				firstName: true,
				lastName: true
			},
			orderBy: {
				lastName: 'asc'
			}
		})

		return NextResponse.json(teachers)
	} catch (error) {
		console.error('Error fetching teachers:', error)
		return NextResponse.json(
			{ error: 'Failed to fetch teachers' },
			{ status: 500 }
		)
	}
} 