import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

import { captureError } from '~/lib/sentry'
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