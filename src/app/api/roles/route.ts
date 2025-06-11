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

/**
 * Retrieves all roles from the database, ordered by name in ascending order.
 *
 * @returns A JSON response containing the list of roles, or a 500 error response if retrieval fails.
 */
export async function GET() {
  try {
    const roles = await prisma.role.findMany({
      orderBy: {
        name: 'asc'
      }
    })
    return NextResponse.json(roles)
  } catch (error) {

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

/**
 * Handles HTTP POST requests to create a new role.
 *
 * Validates the request body against the role schema, checks for duplicate role names, and creates a new role if validation passes and no duplicate exists. Returns appropriate error responses for validation failures, conflicts, or server errors.
 *
 * @param request - The incoming HTTP request containing role data in JSON format.
 * @returns A JSON response with the created role and a 201 status on success, or an error message with the appropriate status code on failure.
 */
export async function POST(request: Request) {
  let requestBody: string;
  try {
    requestBody = await request.text();
    const body = JSON.parse(requestBody);
    
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

    captureError(error, {
      location: 'api/roles',
      type: 'create-role',
      extra: {
        requestBody: requestBody || 'Failed to read request body'
      }
    })
    return NextResponse.json(
      { error: 'Failed to create role' },
      { status: 500 }
    )
  }
} 