import { NextResponse } from 'next/server'
import { resolveTeacherPhoto } from '@/lib/teacher-photo-source'
import { denyUnlessAccess } from '@/lib/api-guard'

export async function GET(request: Request) {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const teacherIdParam = searchParams.get('teacherId')
  const teacherId = teacherIdParam ? parseInt(teacherIdParam, 10) : NaN

  if (Number.isNaN(teacherId) || teacherId < 1) {
    return NextResponse.json({ error: 'Valid teacherId is required' }, { status: 400 })
  }

  const photo = await resolveTeacherPhoto(teacherId)
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
