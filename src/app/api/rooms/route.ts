import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

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
		if (error instanceof Prisma.PrismaClientKnownRequestError) {
			console.error('Prisma error fetching rooms:', error.message)
		} else if (error instanceof Error) {
			console.error('Error fetching rooms:', error.message)
		} else {
			console.error('Unknown error fetching rooms:', error)
		}
		return NextResponse.json(
			{ error: 'Failed to fetch rooms' },
			{ status: 500 }
		)
	}
} 