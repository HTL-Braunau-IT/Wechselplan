import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ImportRequest {
  teachers: {
    firstName: string
    lastName: string
  }[]
}

export async function POST(request: Request) {
  try {
    const data = await request.json() as ImportRequest
    let importedCount = 0

    await prisma.$transaction(async (tx) => {
      // Import new teachers in batches
      await tx.teacher.createMany({
        data: data.teachers.map(teacher => ({
          firstName: teacher.firstName,
          lastName: teacher.lastName
        })),
        skipDuplicates: true
      })
      importedCount = data.teachers.length
    }, {
      timeout: 10000 // Increase timeout to 10 seconds
    })

    return NextResponse.json({
      message: 'Import completed successfully',
      teachers: importedCount
    })
  } catch (error) {
    console.error('Error importing teachers:', error)
    return NextResponse.json(
      { error: 'Failed to import teachers' },
      { status: 500 }
    )
  }
} 