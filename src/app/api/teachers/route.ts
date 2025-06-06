import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

export async function GET() {
	try {
		const teachers = await prisma.teacher.findMany({
			select: {
				id: true,
				firstName: true,
				lastName: true,
				username: true
			},
			orderBy: {
				lastName: 'asc'
			}
		})

		return NextResponse.json(teachers)
	} catch (error) {
		console.error('Error fetching teachers:', error)
		captureError(error, {
			location: 'api/teachers',
			type: 'fetch-teachers'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch teachers' },
			{ status: 500 }
		)
	}
}

export async function POST(request: Request) {
	if (!prisma) {
		return NextResponse.json({ error: 'Database not initialized' }, { status: 500 })
	}

	try {
		const { firstName, lastName, username, email } = await request.json()
		const teacher = await prisma.teacher.create({
			data: {
				firstName,
				lastName,
				username,
				email
			}
		})
		return NextResponse.json(teacher)
	} catch (error) {
		console.error('Error creating teacher:', error)
		captureError(error, {
			location: 'api/teachers',
			type: 'create-teachers',
			extra: {
				requestBody: await request.text()
			}
		})
		return NextResponse.json({ error: 'Failed to create teacher' }, { status: 500 })
	}
} 