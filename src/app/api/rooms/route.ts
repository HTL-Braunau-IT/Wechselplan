import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

export async function GET() {
	try {
		const rooms = await prisma.room.findMany({
			select: {
				id: true,
				name: true
			},
			orderBy: {
				name: 'asc'
			}
		})

		return NextResponse.json({ rooms })
	} catch (error) {
		console.error('Error fetching rooms:', error)
		captureError(error instanceof Error ? error : new Error(String(error)), {
			location: 'api/rooms',
			type: 'fetch-rooms'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch rooms' },
			{ status: 500 }
		)
	}
} 