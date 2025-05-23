import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ImportRequest {
  classes: string[]
}

export async function POST(request: Request) {
  try {
    const data = await request.json() as ImportRequest
    let importedCount = 0
    let updatedCount = 0

    // First, get the current import data
    const importResponse = await fetch('http://localhost:3000/api/students/import', {
      method: 'POST'
    })
    
    if (!importResponse.ok) {
      throw new Error('Failed to fetch import data')
    }

    interface ImportData {
      classes: {
        name: string;
        students: {
          firstName: string;
          lastName: string;
        }[];
      }[];
    }

    const importData = await importResponse.json() as ImportData

    // Import each selected class
    for (const className of data.classes) {
      const classData = importData.classes.find((c) => c.name === className)
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
    console.error('Error importing students:', error)
    return NextResponse.json(
      { error: 'Failed to import students' },
      { status: 500 }
    )
  }
} 