import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { z } from 'zod'

const roleSchema = z.object({
  name: z.string()
    .min(2, 'Role name must be at least 2 characters')
    .max(50, 'Role name must not exceed 50 characters')
    .regex(/^[a-zA-Z0-9\s-_]+$/, 'Role name can only contain letters, numbers, spaces, hyphens and underscores'),
  description: z.string()
    .max(200, 'Description must not exceed 200 characters')
    .optional()
})

export async function GET() {
  try {
    const roles = await prisma.role.findMany({
      orderBy: {
        name: 'asc'
      }
    })
    return NextResponse.json(roles)
  } catch (error) {
    console.error('Error fetching roles:', error)
    captureError(error, {
      location: 'api/roles',
      type: 'fetch-roles'
    })
    return NextResponse.json(
      { error: 'Failed to fetch roles' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate the request body
    const validationResult = roleSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid role data', details: validationResult.error.format() },
        { status: 400 }
      )
    }

    const { name, description } = validationResult.data

    // Check if role with same name already exists
    const existingRole = await prisma.role.findFirst({
      where: { name }
    })

    if (existingRole) {
      return NextResponse.json(
        { error: 'A role with this name already exists' },
        { status: 409 }
      )
    }

    const role = await prisma.role.create({
      data: {
        name,
        description
      }
    })

    return NextResponse.json(role, { status: 201 })
  } catch (error) {
    console.error('Error creating role:', error)
    captureError(error, {
      location: 'api/roles',
      type: 'create-role',
      extra: {
        requestBody: await request.text()
      }
    })
    return NextResponse.json(
      { error: 'Failed to create role' },
      { status: 500 }
    )
  }
} 