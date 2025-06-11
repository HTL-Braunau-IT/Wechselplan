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



export async function POST(request: Request) {
  try {
    const data = await request.json() as ImportRequest
    let importedCount = 0

    // First deduplicate the input data
    const uniqueTeachers = Array.from(new Map(
      data.teachers.map(t => [`${t.firstName}_${t.lastName}`, t])
    ).values())


    // Process all unique teachers
    await Promise.all(
      uniqueTeachers.map(t =>
        prisma.teacher.upsert({
          where: { username: t.username },
          create: t,
          update: t,
        }).then(() => importedCount++)
      )
    )
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