import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { PrismaPromise } from '@prisma/client'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid ID' },
        { status: 400 }
      )
    }

    const breakTime = await prisma.breakTime.findUnique({
      where: { id }
    })

    if (!breakTime) {
      return NextResponse.json(
        { error: 'Break time not found' },
        { status: 404 }
      )
    }

    await prisma.breakTime.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting break time:', error)
    return NextResponse.json(
      { error: 'Failed to delete break time' },
      { status: 500 }
    )
  }
} 