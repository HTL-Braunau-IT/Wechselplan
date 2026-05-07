import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { ok, serverError } from '@/lib/api-response'

/**
 * Handles HTTP GET requests to retrieve all subjects from the database.
 *
 * Returns a JSON response with an array of subjects, each containing its `id` and `name`, ordered alphabetically by name. Responds with a 500 status and error message if retrieval fails.
 */
export async function GET() {
	try {
		const subjects = await prisma.lookupValue.findMany({
			where: { kind: 'SUBJECT' },
			select: {
				id: true,
				name: true
			},
			orderBy: {
				name: 'asc'
			}
		})

		return ok(subjects)
	} catch (error) {
		
		captureError(error, {
			location: 'api/subjects',
			type: 'fetch-subjects'
		})
		return serverError('Failed to fetch subjects')
	}
} 