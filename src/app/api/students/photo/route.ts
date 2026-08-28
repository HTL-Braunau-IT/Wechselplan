import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveStudentPhoto } from '@/lib/student-photo-source'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * GET /api/students/photo?studentId=123
 * Streams the student's photo file if it exists (data/student-photos/<studentId>.<ext>).
 * Tries .jpg, .jpeg, .png. Returns 404 when studentId is missing/invalid or no file found.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  if (!(await isFeatureEnabled('student_photos'))) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const studentIdParam = searchParams.get('studentId')
  const studentId = studentIdParam ? parseInt(studentIdParam, 10) : NaN

  if (Number.isNaN(studentId) || studentId < 1) {
    return NextResponse.json({ error: 'Valid studentId is required' }, { status: 400 })
  }

  const photo = await resolveStudentPhoto(studentId)
  if (!photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
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
