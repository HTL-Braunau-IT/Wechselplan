import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const teacherUsername = searchParams.get('teacher')
    
    if (!teacherUsername) {
        return NextResponse.json({ error: 'Teacher username is required' }, { status: 400 })
    }
    
    const teacher = await prisma.teacher.findUnique({
        where: {
            username: teacherUsername
        }
    })
    
    if (!teacher) {
        return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }

    console.log(teacher.id)
    const asignments = await prisma.teacherAssignment.findFirst({
        where: {
            teacherId: teacher.id
        }
    })

    if (!asignments) {
        return NextResponse.json({ error: 'No classes assigned to teacher' }, { status: 404 })
    }

    console.log("Assignments: ", asignments)
    
    
    
}