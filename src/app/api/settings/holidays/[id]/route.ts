import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.schoolHoliday.delete({
      where: {
        id: parseInt(params.id)
      }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('Prisma error deleting holiday:', error.message)
    } else if (error instanceof Error) {
      console.error('Error deleting holiday:', error.message)
    } else {
      console.error('Unknown error deleting holiday:', error)
    }
    return NextResponse.json(
      { error: 'Failed to delete holiday' },
      { status: 500 }
    )
  }
} 