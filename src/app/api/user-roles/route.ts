import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { badRequest, created, forbidden, notFound, ok, serverError } from '@/lib/api-response'

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions)
  const superAdminObjectId = process.env.ENTRA_SUPER_ADMIN_OBJECT_ID?.trim()
  const userObjectId = session?.user?.id?.trim()

  if (!superAdminObjectId || !userObjectId || userObjectId !== superAdminObjectId) {
    return false
  }

  return true
}

/**
 * Retrieves all role assignments for a specified user.
 *
 * @param request - The HTTP request containing the `userId` as a query parameter.
 * @returns A JSON response with the list of user-role assignments, or an error message if the `userId` is missing or an error occurs.
 */
export async function GET(request: Request) {
  try {
    const isSuperAdmin = await requireSuperAdmin()
    if (!isSuperAdmin) {
      return forbidden('Unauthorized')
    }

    const { searchParams } = new URL(request.url)
    const rawUserId = searchParams.get('userId')
    if (!rawUserId) {
      return badRequest('User ID is required')
    }
    const userId = normalizeUsername(rawUserId)

    const userRoles = await prisma.userRole.findMany({
      where: {
        userId
      },
      include: {
        role: true
      }
    })

    return ok(userRoles)
  } catch (error) {
   
    captureError(error, {
      location: 'api/user-roles',
      type: 'fetch-user-roles',
      extra: {
        searchParams: Object.fromEntries(new URL(request.url).searchParams)
      }
    })
    return serverError('Failed to fetch user roles')
  }
}

/**
 * Assigns a role to a user by creating a user-role association.
 *
 * Parses the request body for `userId` and `roleId`, validates their presence, checks for the existence of the specified role and user (as either a teacher or student), and creates the user-role assignment if all checks pass. Returns the created user-role assignment with role details as JSON. Responds with appropriate error messages and status codes for invalid input, missing entities, or unexpected failures.
 */
export async function POST(request: Request) {
  let requestBody: { userId?: string; roleId?: string | number } = {}
  try {
    const isSuperAdmin = await requireSuperAdmin()
    if (!isSuperAdmin) {
      return forbidden('Unauthorized')
    }

    requestBody = await request.json() as { userId?: string; roleId?: string | number }
    const { userId, roleId } = requestBody
    const numericRoleId = Number(roleId)
 
    if (!userId || Number.isNaN(numericRoleId)) {
      return badRequest('User ID and Role ID are required')
    }

    // Check if the role exists
    const role = await prisma.role.findUnique({
      where: { id: numericRoleId }
    })

    if (!role) {
      return notFound('Role not found')
    }

    // Check if the user exists (either as a teacher or student)
    const normalizedUserId = normalizeUsername(userId)
    const teacher = await prisma.teacher.findUnique({
      where: { username: normalizedUserId }
    })

    const student = await prisma.student.findUnique({
      where: { username: normalizedUserId }
    })

    if (!teacher && !student) {
      return notFound('User not found')
    }

    // Create the user role assignment (store normalized userId)
    const userRole = await prisma.userRole.create({
      data: {
        userId: normalizedUserId,
        roleId: numericRoleId
      },
      include: {
        role: true
      }
    })

    return created(userRole)
  } catch (error) {
   
    captureError(error, {
      location: 'api/user-roles',
      type: 'assign-role',
      extra: {
        requestBody
      }
    })
    return serverError('Failed to assign role to user')
  }
}

/**
 * Removes a user-role assignment based on the provided user ID and role ID.
 *
 * Expects `userId` and `roleId` as query parameters in the request URL. Returns a success message upon successful deletion, or an error message with an appropriate status code if validation fails or an error occurs.
 */
export async function DELETE(request: Request) {
  try {
    const isSuperAdmin = await requireSuperAdmin()
    if (!isSuperAdmin) {
      return forbidden('Unauthorized')
    }

    const { searchParams } = new URL(request.url)
    const rawUserId = searchParams.get('userId')
    const roleId = searchParams.get('roleId')

    if (!rawUserId || !roleId) {
      return badRequest('User ID and Role ID are required')
    }
    const userId = normalizeUsername(rawUserId)

    const numericRoleId = Number(roleId)
    if (Number.isNaN(numericRoleId)) {
      return badRequest('Invalid Role ID format')
    }

    await prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId,
          roleId: numericRoleId
        }
      }
    })

    return ok(null, 'Role assignment removed successfully')
  } catch (error) {
    
    captureError(error, {
      location: 'api/user-roles',
      type: 'remove-role',
      extra: { url: request.url }
    })
    return serverError('Failed to remove role assignment')
  }
} 