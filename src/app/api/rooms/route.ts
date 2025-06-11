import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

/**
 * Handles HTTP GET requests to retrieve a list of rooms from the database.
 *
 * Returns a JSON response containing an array of room objects, each with `id` and `name` fields, ordered alphabetically by name. If an error occurs during retrieval, responds with a 500 status and an error message.
 */
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