import { NextResponse } from 'next/server'
import { PrismaClient, type Class } from '@prisma/client'

const prisma = new PrismaClient()

// GET /api/classes - Get all unique class names
export async function GET() {
    try {
        const classes = await prisma.class.findMany({
            select: { name: true },
            orderBy: { name: 'asc' }
        }) as Pick<Class, 'name'>[]
        
        // Flatten to array of strings
        const classNames = classes.map((c) => c.name)
        return NextResponse.json(classNames)
    } catch (error) {
        console.error('Error fetching classes:', error)
        return NextResponse.json(
            { error: 'Failed to fetch classes' },
            { status: 500 }
        )
    }
} 