import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '~/lib/sentry'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid ID' },
        { status: 400 }
      )
    }

    await prisma.scheduleTime.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/settings/schedule-times/[id]',
      type: 'delete-schedule-time'
    })  
    return NextResponse.json(
      { error: 'Failed to delete schedule time' },
      { status: 500 }
    )
  }
} 