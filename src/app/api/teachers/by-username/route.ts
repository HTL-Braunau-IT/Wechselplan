import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { badRequest, notFound, ok, serverError } from '@/lib/api-response'

/**
 * Handles GET requests to retrieve a teacher's information by username.
 *
 * Extracts the `username` query parameter from the request URL and returns the corresponding teacher's data as JSON. Responds with an error message and appropriate HTTP status code if the parameter is missing, the teacher is not found, or an unexpected error occurs.
 *
 * @returns A JSON response containing the teacher's information, or an error message with HTTP status 400, 404, or 500.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const rawUsername = searchParams.get('username')
    if (!rawUsername) {
      return badRequest('Username parameter is required')
    }
    const username = normalizeUsername(rawUsername)
    if (!username) {
      return badRequest('Username parameter is required')
    }

    const teacher = await prisma.teacher.findUnique({
      where: { username }
    })

    if (!teacher) {
      console.warn('[username-match] Teacher not found', { raw: rawUsername, normalized: username })
      return notFound('Teacher not found')
    }

    return ok(teacher)
  } catch (error) {
    captureError(error, {
      location: 'api/teachers/by-username',
      type: 'fetch-teacher-by-username'
    })
    return serverError('Failed to fetch teacher')
  }
} 