import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveStudentPhoto } from '@/lib/student-photo-source'
import { badRequest, forbidden, notFound } from '@/lib/api-response'

/**
 * GET /api/students/photo?studentId=123
 * Streams the student's photo file if it exists (data/student-photos/<studentId>.<ext>).
 * Tries .jpg, .jpeg, .png. Returns 404 when studentId is missing/invalid or no file found.
 */
export async function GET(request: Request) {
  if (!(await isFeatureEnabled('student_photos'))) {
    return forbidden('Feature not available')
  }

  const { searchParams } = new URL(request.url)
  const studentIdParam = searchParams.get('studentId')
  const studentId = studentIdParam ? parseInt(studentIdParam, 10) : NaN

  if (Number.isNaN(studentId) || studentId < 1) {
    return badRequest('Valid studentId is required')
  }

  const photo = await resolveStudentPhoto(studentId)
  if (!photo) {
    return notFound('Photo not found')
  }

  const ifNoneMatch = request.headers.get('if-none-match')?.trim()
  if (ifNoneMatch === photo.etag || ifNoneMatch === `W/${photo.etag}`) {
    return new NextResponse(null, { status: 304, headers: { ETag: photo.etag } })
  }

  return new NextResponse(photo.bytes, {
    status: 200,
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'private, max-age=604800, stale-while-revalidate=86400',
      ETag: photo.etag,
      'X-Photo-Source': photo.source,
    },
  })
}
