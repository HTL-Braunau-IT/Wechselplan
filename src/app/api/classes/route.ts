import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET /api/classes - Get all unique class names
export async function GET() {
    try {
        const classes = await prisma.student.findMany({
            select: { class: true },
            distinct: ['class'],
            orderBy: { class: 'asc' },
        })
        // Flatten to array of strings
        const classNames = classes.map((c) => c.class)
        return NextResponse.json(classNames)
    } catch (error) {
        console.error('Error fetching classes:', error)
        return NextResponse.json(
            { error: 'Failed to fetch classes' },
            { status: 500 }
        )
    }
} 