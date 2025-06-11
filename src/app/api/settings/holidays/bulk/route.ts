import { NextResponse } from 'next/server'
import { db } from '@/server/db'
import { captureError } from '~/lib/sentry'
/**
 * Handles bulk creation of school holidays from a POST request.
 *
 * Expects a JSON array of holiday objects, each with `name`, `startDate`, and `endDate` fields. Returns the created holiday records on success, or an error response if validation fails or an internal error occurs.
 *
 * @returns A JSON response containing the created holiday records, or an error message with the appropriate HTTP status code.
 */
export async function POST(request: Request) {
  try {
    const holidays = await request.json() as Array<{
      name: string
      startDate: string
      endDate: string
    }>

    if (!Array.isArray(holidays) || holidays.length === 0) {
      return NextResponse.json(
        { error: 'Invalid holidays data' },
        { status: 400 }
      )
    }

    // Create all holidays in a transaction
    const createdHolidays = await db.$transaction(
      holidays.map(holiday =>
        db.schoolHoliday.create({
          data: {
            name: holiday.name,
            startDate: new Date(holiday.startDate),
            endDate: new Date(holiday.endDate)
          }
        })
      )
    )

    return NextResponse.json(createdHolidays)
  } catch (error) {
   
    captureError(error, {
      location: 'api/settings/holidays/bulk',
      type: 'save-holidays'
    })
    return NextResponse.json(
      { error: 'Failed to save holidays' },
      { status: 500 }
    )
  }
} 