import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

/**
 * Handles HTTP GET requests to retrieve a list of subjects from the database.
 *
 * Returns a JSON response containing an array of subjects, each with its `id` and `name`, ordered alphabetically by name. If an error occurs during retrieval, responds with a 500 status and an error message.
 */
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