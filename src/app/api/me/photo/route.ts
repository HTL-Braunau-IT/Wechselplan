import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveSessionStudent } from '@/lib/session-student'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { resolveStudentPhoto } from '@/lib/student-photo-source'
import { resolveTeacherPhoto } from '@/lib/teacher-photo-source'
import { denyUnlessAccess } from '@/lib/api-guard'

export async function GET(request: Request) {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

  const session = await getServerSession(authOptions)
  if (!session?.user?.name || !session.user.role) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  let photo:
    | Awaited<ReturnType<typeof resolveTeacherPhoto>>
    | Awaited<ReturnType<typeof resolveStudentPhoto>>
    | null = null

  if (session.user.role === 'teacher' || session.user.role === 'admin') {
    const teacher = await resolveSessionTeacher(session)
    if (teacher) {
      photo = await resolveTeacherPhoto(teacher.id)
    }
  } else if (session.user.role === 'student') {
    const student = await resolveSessionStudent(session)
    if (student) {
      photo = await resolveStudentPhoto(student.id)
    }
  }

  if (!photo) {
    return NextResponse.json({ error: 'Foto nicht gefunden' }, { status: 404 })
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
