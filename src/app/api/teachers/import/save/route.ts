import { NextResponse } from 'next/server'
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

interface ImportRequest {
  teachers: {
    firstName: string
    lastName: string
  }[]
}

interface ExistingTeacher {
  firstName: string
  lastName: string
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
        lastName: true
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
      for (const teacher of newTeachers) {
        await (prisma as unknown as { teacher: { create: (args: Prisma.TeacherCreateArgs) => Promise<ExistingTeacher> } }).teacher.create({
          data: {
            firstName: teacher.firstName,
            lastName: teacher.lastName
          }
        })
        importedCount++
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