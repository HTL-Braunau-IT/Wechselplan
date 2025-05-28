import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!prisma) {
    return NextResponse.json({ error: 'Database not initialized' }, { status: 500 })
  }

  try {
    const { firstName, lastName, username } = await request.json()
    const teacher = await prisma.teacher.update({
      where: { id: parseInt(params.id) },
      data: {
        firstName,
        lastName,
        username
      }
    })
    return NextResponse.json(teacher)
  } catch (error) {
    console.error('Error updating teacher:', error)
    return NextResponse.json({ error: 'Failed to update teacher' }, { status: 500 })
  }
} 