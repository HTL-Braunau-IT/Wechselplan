import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { badRequest, notFound, ok, serverError } from '@/lib/api-response'
import { captureError } from '~/lib/sentry'
/**
 * Handles DELETE requests to remove a break time entry by its ID.
 *
 * Validates the provided ID and deletes the corresponding break time record from the database. Returns a JSON response indicating success or an error message if the operation fails.
 *
 * @param request - The incoming HTTP request.
 * @param params - An object containing a promise that resolves to an object with an `id` string.
 * @returns A JSON response indicating the result of the deletion operation.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)
    if (isNaN(id)) {
      return badRequest('Invalid ID')
    }

    await prisma.breakTime.delete({
      where: { id }
    })

    return ok(null, 'Break time deleted successfully')
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return notFound('Break time not found')
    }
    captureError(error, {
      location: 'api/settings/break-times/[id]',
      type: 'delete-break-time'
    })
    return serverError('Failed to delete break time')
  }
} 