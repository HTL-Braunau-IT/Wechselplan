import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { ok, serverError } from '@/lib/api-response'

/**
 * Handles HTTP GET requests to fetch a list of rooms from the database.
 *
 * Returns a JSON response with an array of room objects, each containing `id` and `name`, ordered alphabetically by name. If retrieval fails, responds with a 500 status and an error message.
 */
export async function GET() {
	try {
		const rooms = await prisma.lookupValue.findMany({
			where: { kind: 'ROOM' },
			select: {
				id: true,
				name: true
			},
			orderBy: {
				name: 'asc'
			}
		})

		return ok(rooms)
	} catch (error) {
		captureError(error instanceof Error ? error : new Error(String(error)), {
			location: 'api/rooms',
			type: 'fetch-rooms'
		})
		return serverError('Failed to fetch rooms')
	}
} 