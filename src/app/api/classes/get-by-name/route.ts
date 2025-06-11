import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { captureError } from '@/lib/sentry'

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