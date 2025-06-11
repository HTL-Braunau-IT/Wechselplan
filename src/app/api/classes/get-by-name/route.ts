import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { captureError } from '@/lib/sentry'

/**
 * Handles GET requests to retrieve class information by name.
 *
 * Extracts the `name` query parameter from the request URL and returns the corresponding class data as JSON.
 * Responds with a 400 status if the `name` parameter is missing, 404 if the class is not found, or 500 if an internal error occurs.
 *
 * @returns A JSON response containing the class data, or an error message with the appropriate HTTP status code.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')

    if (!name) {
      return NextResponse.json(
        { error: 'Class name is required' },
        { status: 400 }
      )
    }

    const classData = await db.class.findUnique({
      where: {
        name: name
      }
    })

    if (!classData) {
      return NextResponse.json(
        { error: 'Class not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(classData)
  } catch (error) {

    captureError(error, {
      location: 'api/classes/get-by-name',
      type: 'fetch-class-by-name',
      extra: {
        searchParams: Object.fromEntries(new URL(request.url).searchParams)
      }
    })
    return NextResponse.json(
      { error: 'Failed to fetch class' },
      { status: 500 }
    )
  }
} 