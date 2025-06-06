import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { captureError } from '@/lib/sentry'

export async function GET() {
	try {
		const subjects = await prisma.subject.findMany({
			select: {
				id: true,
				name: true
			},
			orderBy: {
				name: 'asc'
			}
		})

		return NextResponse.json({ subjects })
	} catch (error) {
		console.error('Error fetching subjects:', error)
		captureError(error, {
			location: 'api/subjects',
			type: 'fetch-subjects'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch subjects' },
			{ status: 500 }
		)
	}
} 