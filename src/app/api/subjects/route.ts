import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

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
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			console.error('Prisma error fetching subjects:', error.message)
		} else if (error instanceof Error) {
			console.error('Error fetching subjects:', error.message)
		} else {
			console.error('Unknown error fetching subjects:', error)
		}
		return NextResponse.json(
			{ error: 'Failed to fetch subjects' },
			{ status: 500 }
		)
	}
} 