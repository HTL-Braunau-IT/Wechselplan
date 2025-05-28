import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET /api/students/all - Get all students
export async function GET() {
    try {
        const students = await prisma.student.findMany({
            orderBy: [
                { lastName: 'asc' },
                { firstName: 'asc' }
            ]
        })

        return NextResponse.json(students)
    } catch (error) {
        console.error('Error fetching all students:', error)
        return NextResponse.json(
            { error: 'Failed to fetch students' },
            { status: 500 }
        )
    }
} 