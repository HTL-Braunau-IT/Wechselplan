import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { ok, serverError } from '@/lib/api-response'

/**
 * Handles GET requests to retrieve a list of learning contents from the database.
 *
 * Returns a JSON response containing an array of learning content objects, each with `id` and `name` properties, ordered alphabetically by name.
 *
 * @returns A JSON response with the list of learning contents, or an error message with status 500 if retrieval fails.
 */
export async function GET() {
	try {
		const learningContents = await prisma.lookupValue.findMany({
			where: { kind: 'LEARNING_CONTENT' },
			select: {
				id: true,
				name: true
			},
			orderBy: {
				name: 'asc'
			}
		})

		return ok(learningContents)
	} catch (error: unknown) {
		captureError(error, {
			location: 'api/learning-contents',
			type: 'fetch-contents'
		})
		return serverError('Failed to fetch learning contents')
	}
}
