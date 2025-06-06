import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { captureError } from '@/lib/sentry'

const prisma = new PrismaClient()

// GET /api/classes - Get all classes with full details
export async function GET() {
    try {
        const classes = await prisma.class.findMany({
            select: {
                id: true,
                name: true,
                description: true
            },
            orderBy: { name: 'asc' }
        })
        
        return NextResponse.json(classes)
    } catch (error) {
        console.error('Error fetching classes:', error)
        captureError(error, {
            location: 'api/classes',
            type: 'fetch-classes'
        })
        return NextResponse.json(
            { error: 'Failed to fetch classes' },
            { status: 500 }
        )
    }
} 