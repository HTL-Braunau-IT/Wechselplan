import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { captureError } from '@/lib/sentry'

const prisma = new PrismaClient()

/**
 * Handles GET requests to retrieve all classes with their full details.
 *
 * Returns a JSON array of class objects, each containing `id`, `name`, `description`, 
 * `classHeadId`, and `classLeadId` information, ordered alphabetically by name.
 *
 * @returns A JSON response with the list of classes or an error message with status 500 if the query fails.
 */
export async function GET() {
    try {
        const classes = await prisma.class.findMany({
            select: {
                id: true,
                name: true,
                description: true,
                classHeadId: true,
                classLeadId: true
            },
            orderBy: { name: 'asc' },

        })
        
        return NextResponse.json(classes)
    } catch (error) {
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