import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

import { captureError } from '~/lib/sentry'
/**
 * Handles DELETE requests to remove a holiday entry by its ID.
 *
 * Awaits the provided `params` promise to obtain the holiday ID, deletes the corresponding record from the database, and returns a JSON response indicating success. If deletion fails, logs the error and returns a JSON error response with HTTP status 500.
 *
 * @param request - The incoming HTTP request.
 * @param params - An object containing a promise that resolves to an object with the holiday `id`.
 * @returns A JSON response indicating the result of the deletion operation.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    await prisma.schoolHoliday.delete({
      where: {
        id: parseInt(resolvedParams.id)
      }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/settings/holidays/[id]',
      type: 'delete-holiday'
    })
    return NextResponse.json(
      { error: 'Failed to delete holiday' },
      { status: 500 }
    )
  }
} 