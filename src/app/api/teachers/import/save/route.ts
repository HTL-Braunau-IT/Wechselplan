import { NextResponse } from 'next/server'
import { PrismaClient} from '@prisma/client'
import { captureError } from '~/lib/sentry'

const prisma = new PrismaClient()

interface ImportRequest {
  teachers: {
    firstName: string
    lastName: string
    username: string
    email?: string
  }[]
}



/**
 * Handles a POST request to import and upsert teacher records from a JSON payload.
 *
 * Deduplicates teachers by first and last name, then upserts each unique teacher into the database based on their username. Returns a JSON response with the import results.
 *
 * @returns A JSON response containing a success message, the number of teachers imported, the total number of unique teachers processed, and the number of skipped entries.
 *
 * @throws {Error} If parsing the request body or database operations fail, returns a 500 response with an error message.
 */
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
    captureError(error, {
      location: 'api/teachers/import/save',
      type: 'import-teachers'
    })  
    return NextResponse.json(
      { error: 'Failed to import teachers' },
      { status: 500 }
    )
  }
} 