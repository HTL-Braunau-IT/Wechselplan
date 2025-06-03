import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'


export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const teacherUsername = searchParams.get('teacher')
    const currentWeekday = searchParams.get('weekday') ?? '0'

    if (!teacherUsername) {
        return NextResponse.json({ error: 'Teacher username is required' }, { status: 400 })
    }
    
    const teacher = await prisma.teacher.findUnique({
        where: {
            username: teacherUsername
        }
    })
    
    if (!teacher) {
        return NextResponse.json({ error: 'Teacher not found' }, { status: 230 })
    }

    const asignments = await prisma.teacherAssignment.findMany({
        where: {
            teacherId: teacher.id
        }
    })

    if (!asignments) {
        return NextResponse.json({ error: 'No classes assigned to teacher' }, { status: 230 })
    }

    const teacherRotation = await prisma.teacherRotation.findMany({
        where: {
            teacherId: teacher.id
        }
    })

    if (!teacherRotation) {
        return NextResponse.json({ error: 'No teacher rotation found' }, { status: 404 })
    }

    const classIds = [...new Set(asignments.map(assignment => assignment.classId))]
    const schedules = []
    const students = []
    const classdata: { id: number; name: string }[] = []
    const validClassIds = new Set<number>()

    // First fetch all class data
    for (const classId of classIds) {
        const classInfo = await prisma.class.findUnique({
            where: {
                id: classId
            }
        })
        if (classInfo) {
            classdata.push(classInfo)
        }
    }

    // Then fetch schedules and students for each class
    for (const classId of classIds) {
        console.log("Fetching schedule for class", classId, "on weekday", currentWeekday)
        const schedule = await prisma.schedule.findFirst({
            where: {
                classId: classId,
                selectedWeekday: parseInt(currentWeekday)
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
        console.log("Found schedule for class", classId, ":", schedule)
        
        // Add schedule if it exists for this weekday
        if (schedule) {
            schedules.push([schedule])
            validClassIds.add(classId)
        } else {
            // Add empty array to maintain index alignment with classIds
            schedules.push([])
        }
        
        // Always fetch students for each class, regardless of schedule
        const student = await prisma.student.findMany({
            where: {
                classId: classId
            }
        })
        if (student) {
            students.push(student)
        }
    }

    // Filter assignments to only include those with valid schedules for this weekday
    const filteredAssignments = asignments.filter(assignment => 
        validClassIds.has(assignment.classId)
    )

    
    console.log("Filtered assignments:", filteredAssignments)
    console.log("Class data:", classdata)

    // Only return error if we have no students
    if (students.length === 0) {
        return NextResponse.json({ error: 'No students found' }, { status: 230 })
    }
    
    return NextResponse.json({
        schedules,
        students,
        teacherRotation,
        assignments: filteredAssignments,
        classdata: classdata
    }, { status: 200 })
}