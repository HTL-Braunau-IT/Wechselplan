import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { badRequest, notFound, ok, serverError } from '@/lib/api-response'
import { captureError } from '~/lib/sentry'

/**
 * Handles HTTP DELETE requests to remove a schedule time entry by its ID.
 *
 * Validates the provided ID and deletes the corresponding schedule time from the database if valid.
 * Returns a JSON response indicating success or an error message if the operation fails.
 *
 * @param request - The incoming HTTP request.
 * @param params - An object containing a promise that resolves to the route parameters, including the schedule time ID as a string.
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

    await prisma.scheduleTime.delete({
      where: { id }
    })

    return ok(null, 'Schedule time deleted successfully')
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return notFound('Schedule time not found')
    }
    captureError(error, {
      location: 'api/settings/schedule-times/[id]',
      type: 'delete-schedule-time'
    })  
    return serverError('Failed to delete schedule time')
  }
} 