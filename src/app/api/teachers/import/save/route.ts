import { NextResponse } from 'next/server'
import { PrismaClient} from '@prisma/client'

const prisma = new PrismaClient()

interface ImportRequest {
  teachers: {
    firstName: string
    lastName: string
    username: string
    email?: string
  }[]
}

interface ExistingTeacher {
  firstName: string
  lastName: string
  username: string
  email?: string
}

export async function POST(request: Request) {
  try {
    const data = await request.json() as ImportRequest
    let importedCount = 0

    // First deduplicate the input data
    const uniqueTeachers = Array.from(new Map(
      data.teachers.map(t => [`${t.firstName}_${t.lastName}`, t])
    ).values())

    // Get existing teachers first
    const existingTeachers = await prisma.teacher.findMany({
       select: {
         firstName: true,
         lastName: true,
         username: true
       }
     })

    // Create a set of existing teacher names for quick lookup


    // Process all unique teachers
    for (const teacher of uniqueTeachers) {
      const existingTeacher = existingTeachers.find(
        t => t.firstName === teacher.firstName && t.lastName === teacher.lastName
      )
      if (existingTeacher) {
        // Update existing teacher
         const teacherData: ExistingTeacher = {
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          username: teacher.username,
          email: teacher.email
         }
         const updatedTeacher = await prisma.teacher.update({
           where: {
             username: existingTeacher.username
           },
           data: teacherData
         })
         if (updatedTeacher) {
           importedCount++
         }
      } else {
        // Create new teacher
        const teacherData: ExistingTeacher = {
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          username: teacher.username,
          email: teacher.email
         }
        const createdTeacher = await prisma.teacher.create({
          data: teacherData
        })
        if (createdTeacher) {
          importedCount++
        }
       }
     }

    return NextResponse.json({
      message: 'Import completed successfully',
      teachers: importedCount,
      total: uniqueTeachers.length,
      skipped: uniqueTeachers.length - importedCount
    })
  } catch (error) {
    console.error('Error importing teachers:', error)
    return NextResponse.json(
      { error: 'Failed to import teachers' },
      { status: 500 }
    )
  }
} 