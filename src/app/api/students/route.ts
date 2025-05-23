import { NextResponse } from 'next/server'
import { PrismaClient, type Class } from '@prisma/client'

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
        // First find the class by name
        const classRecord = await prisma.class.findUnique({
            where: { name: className }
        }) as Class | null

        if (!classRecord) {
            return NextResponse.json(
                { error: 'Class not found' },
                { status: 404 }
            )
        }

        const students = await prisma.student.findMany({
            where: {
                classId: classRecord.id
            },
            orderBy: [
                { lastName: 'asc' },
                { firstName: 'asc' }
            ]
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