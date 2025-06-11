import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { POST as importStudents } from '../route'
import { captureError } from '~/lib/sentry'

interface ImportRequest {
  classes: string[]
}

interface ImportData {
  classes: {
    name: string
    students: {
      firstName: string
      lastName: string
      username: string
    }[]
  }[]
}

export async function POST(request: Request) {
  try {
    const data = await request.json() as ImportRequest
    let importedCount = 0
    let updatedCount = 0

    // Get import data directly from the import function
    const importResponse = await importStudents()
    if (!importResponse.ok) {
      throw new Error('Failed to fetch import data')
    }

    const importData = await importResponse.json() as ImportData

    // Import each selected class
    for (const className of data.classes) {
      const classData = importData.classes.find((c: { name: string }) => c.name === className)
      if (!classData) continue

      // Get or create the class
      const classRecord = await prisma.class.upsert({
        where: { name: className },
        update: {},
        create: { name: className }
      })

      // Delete existing students in this class
      await prisma.student.deleteMany({
        where: {
          classId: classRecord.id
        }
      })

      // Import new students for this class
      for (const student of classData.students) {
        await prisma.student.create({
          data: {
            firstName: student.firstName,
            lastName: student.lastName,
            username: student.username,
            classId: classRecord.id
          }
        })
        importedCount++
      }
      updatedCount++
    }

    return NextResponse.json({
      message: 'Import completed successfully',
      students: importedCount,
      classes: updatedCount
    })  
  } catch (error) {
    captureError(error, {
      location: 'api/students/import/save',
      type: 'import-students'
    })
    return NextResponse.json(
      { error: 'Failed to import students' },
      { status: 500 }
    )
  }
} 