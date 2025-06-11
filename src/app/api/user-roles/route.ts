import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

/**
 * Retrieves all role assignments for a specified user.
 *
 * @param request - The HTTP request containing the `userId` as a query parameter.
 * @returns A JSON response with the list of user-role assignments, or an error message if the `userId` is missing or an error occurs.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const userRoles = await prisma.userRole.findMany({
      where: {
        userId
      },
      include: {
        role: true
      }
    })

    return NextResponse.json(userRoles)
  } catch (error) {
   
    captureError(error, {
      location: 'api/user-roles',
      type: 'fetch-user-roles',
      extra: {
        searchParams: Object.fromEntries(new URL(request.url).searchParams)
      }
    })
    return NextResponse.json(
      { error: 'Failed to fetch user roles' },
      { status: 500 }
    )
  }
}

/**
 * Assigns a role to a user by creating a user-role association.
 *
 * Parses the request body for `userId` and `roleId`, validates their presence, checks for the existence of the specified role and user (as either a teacher or student), and creates the user-role assignment if all checks pass. Returns the created user-role assignment with role details as JSON. Responds with appropriate error messages and status codes for invalid input, missing entities, or unexpected failures.
 */
export async function POST(request: Request) {
  try {
    const { userId, roleId } = await request.json() as { userId?: string; roleId?: string | number }
    const numericRoleId = Number(roleId)
 
    if (!userId || Number.isNaN(numericRoleId)) {
      return NextResponse.json(
        { error: 'User ID and Role ID are required' },
        { status: 400 }
      )
    }

    // Check if the role exists
    const role = await prisma.role.findUnique({
      where: { id: numericRoleId }
    })

    if (!role) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      )
    }

    // Check if the user exists (either as a teacher or student)
    const teacher = await prisma.teacher.findUnique({
      where: { username: userId }
    })

    const student = await prisma.student.findUnique({
      where: { username: userId }
    })

    if (!teacher && !student) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Create the user role assignment
    const userRole = await prisma.userRole.create({
      data: {
        userId,
        roleId: numericRoleId
      },
      include: {
        role: true
      }
    })

    return NextResponse.json(userRole)
  } catch (error) {
   
    captureError(error, {
      location: 'api/user-roles',
      type: 'assign-role',
      extra: {
        requestBody: await request.text()
      }
    })
    return NextResponse.json(
      { error: 'Failed to assign role to user' },
      { status: 500 }
    )
  }
}

/**
 * Removes a user-role assignment based on the provided user ID and role ID.
 *
 * Expects `userId` and `roleId` as query parameters in the request URL. Returns a success message upon successful deletion, or an error message with an appropriate status code if validation fails or an error occurs.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const roleId = searchParams.get('roleId')

    if (!userId || !roleId) {
      return NextResponse.json(
        { error: 'User ID and Role ID are required' },
        { status: 400 }
      )
    }

    const numericRoleId = Number(roleId)
    if (Number.isNaN(numericRoleId)) {
      return NextResponse.json(
        { error: 'Invalid Role ID format' },
        { status: 400 }
      )
    }

    await prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId,
          roleId: numericRoleId
        }
      }
    })

    return NextResponse.json({ message: 'Role assignment removed successfully' })
  } catch (error) {
    
    captureError(error, {
      location: 'api/user-roles',
      type: 'remove-role',
      extra: {
        requestBody: await request.text()
      }
    })
    return NextResponse.json(
      { error: 'Failed to remove role assignment' },
      { status: 500 }
    )
  }
} 