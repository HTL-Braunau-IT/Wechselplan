import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ImportRequest {
  classes: string[] // Array of class names to import
}

export async function POST(request: Request) {
  try {
    const data: ImportRequest = await request.json()
    let importedCount = 0
    let updatedCount = 0

    // First, get the current import data
    const importResponse = await fetch('http://localhost:3000/api/students/import', {
      method: 'POST'
    })
    
    if (!importResponse.ok) {
      throw new Error('Failed to fetch import data')
    }

    const importData = await importResponse.json()

    // Import each selected class
    for (const className of data.classes) {
      const classData = importData.classes.find((c: any) => c.name === className)
      if (!classData) continue

      // Delete existing students in this class
      await prisma.student.deleteMany({
        where: {
          class: className
        }
      })

      // Import new students for this class
      for (const student of classData.students) {
        await prisma.student.create({
          data: {
            firstName: student.firstName,
            lastName: student.lastName,
            class: className
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