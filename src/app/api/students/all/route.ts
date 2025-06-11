import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '~/lib/sentry'

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
        captureError(error, {
            location: 'api/students/all',   
            type: 'fetch-students'
        })
        return NextResponse.json(
            { error: 'Failed to fetch students' },
            { status: 500 }
        )
    }
} 