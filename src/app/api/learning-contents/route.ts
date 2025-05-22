import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

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
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			console.error('Prisma error fetching learning contents:', error.message)
		} else if (error instanceof Error) {
			console.error('Error fetching learning contents:', error.message)
		} else {
			console.error('Unknown error fetching learning contents:', error)
		}
		return NextResponse.json(
			{ error: 'Failed to fetch learning contents' },
			{ status: 500 }
		)
	}
} 