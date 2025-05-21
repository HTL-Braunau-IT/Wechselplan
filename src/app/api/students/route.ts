import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET /api/students?class=1AHITS - Get all students for a class
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const className = searchParams.get('class')

    if (!className) {
        return NextResponse.json(
            { error: 'Class parameter is required' },
            { status: 400 }
        )
    }

    try {
        const students = await prisma.student.findMany({
            where: {
                class: className,
            },
            orderBy: [
                { lastName: 'asc' },
                { firstName: 'asc' },
            ],
        })

        return NextResponse.json(students)
    } catch (error) {
        console.error('Error fetching students:', error)
        return NextResponse.json(
            { error: 'Failed to fetch students' },
            { status: 500 }
        )
    }
} 