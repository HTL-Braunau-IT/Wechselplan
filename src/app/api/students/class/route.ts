import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/students/class?username=1AHIF_dummy - Get a student's class
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')

    if (!username) {
        return NextResponse.json(
            { error: 'Username parameter is required' },
            { status: 400 }
        )
    }

    try {
        // Find the student by username
        const student = await prisma.student.findUnique({
            where: { username },
            include: {
                class: true
            }
        })

        if (!student) {
            return NextResponse.json(
                { error: 'Student not found' },
                { status: 404 }
            )
        }

        if (!student.class) {
            return NextResponse.json(
                { error: 'Student has no class assigned' },
                { status: 404 }
            )
        }

        return NextResponse.json({
            class: student.class.name
        })
    } catch (error) {
        console.error('Error fetching student class:', error)
        return NextResponse.json(
            { error: 'Failed to fetch student class' },
            { status: 500 }
        )
    }
} 