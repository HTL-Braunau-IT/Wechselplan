import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ImportRequest {
  classes: {
    name: string
    students: {
      firstName: string
      lastName: string
    }[]
  }[]
}

export async function POST(request: Request) {
  try {
    const data: ImportRequest = await request.json()
    let importedCount = 0

    // Import each selected class
    for (const classData of data.classes) {
      // Import students for this class
      for (const student of classData.students) {
        await prisma.student.create({
          data: {
            firstName: student.firstName,
            lastName: student.lastName,
            class: classData.name
          }
        })
        importedCount++
      }
    }

    return NextResponse.json({
      message: 'Import completed successfully',
      importedCount,
      classCount: data.classes.length
    })
  } catch (error) {
    console.error('Error importing students:', error)
    return NextResponse.json(
      { error: 'Failed to import students' },
      { status: 500 }
    )
  }
} 