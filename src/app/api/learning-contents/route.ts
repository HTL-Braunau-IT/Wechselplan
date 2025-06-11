import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import type { Prisma } from '@prisma/client'

interface LearningContent {
	id: string
	name: string
}

export async function GET() {
	try {
		const learningContents = await (prisma as unknown as { learningContent: { findMany: (args: Prisma.LearningContentFindManyArgs) => Promise<LearningContent[]> } }).learningContent.findMany({
			select: {
				id: true,
				name: true
			},
			orderBy: {
				name: 'asc'
			}
		})

		return NextResponse.json({ learningContents })
	} catch (error: unknown) {
		
		captureError(error, {
			location: 'api/learning-contents',
			type: 'fetch-contents'
		})
		return NextResponse.json(
			{ error: 'Failed to fetch learning contents' },
			{ status: 500 }
		)
	}
} 