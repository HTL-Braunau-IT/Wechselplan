import { NextResponse } from 'next/server'
import { PrismaClient, type Prisma } from '@prisma/client'

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
    const existingTeachers = await (prisma as unknown as { teacher: { findMany: (args: Prisma.TeacherFindManyArgs) => Promise<ExistingTeacher[]> } }).teacher.findMany({
      select: {
        firstName: true,
        lastName: true,
        username: true
      }
    })

    // Create a set of existing teacher names for quick lookup
    const existingTeacherSet = new Set(
      existingTeachers.map(t => `${t.firstName}_${t.lastName}`)
    )

    // Filter out teachers that already exist
    const newTeachers = uniqueTeachers.filter(
      t => !existingTeacherSet.has(`${t.firstName}_${t.lastName}`)
    )

    // Only create new teachers if there are any
    if (newTeachers.length > 0) {
      for (const newTeacher of newTeachers) {
        const existingTeacher = existingTeachers.find(t => t.firstName === newTeacher.firstName && t.lastName === newTeacher.lastName)
        if (existingTeacher) {
          const teacherData: ExistingTeacher = {
            firstName: newTeacher.firstName,
            lastName: newTeacher.lastName,
            username: newTeacher.username,
            email: newTeacher.email
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
          const teacherData: ExistingTeacher = {
            firstName: newTeacher.firstName,
            lastName: newTeacher.lastName,
            username: newTeacher.username,
            email: newTeacher.email
          }
          const createdTeacher = await prisma.teacher.create({
            data: teacherData
          })
          if (createdTeacher) {
            importedCount++
          }
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