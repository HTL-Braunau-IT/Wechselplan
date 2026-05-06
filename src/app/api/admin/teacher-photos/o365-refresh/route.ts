export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { refreshTeacherO365PhotoCache } from '@/lib/teacher-photo-source'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Nicht berechtigt: Admin-Rolle erforderlich' }, { status: 403 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { teacherIds?: unknown }
    let teacherIds: number[]

    if (Array.isArray(body.teacherIds) && body.teacherIds.length > 0) {
      teacherIds = body.teacherIds
        .map(id => (typeof id === 'number' ? id : Number.NaN))
        .filter(id => Number.isInteger(id) && id > 0)
    } else {
      const teachers = await prisma.teacher.findMany({
        where: { externalSource: 'entra', externalId: { not: null } },
        select: { id: true },
        take: 1000,
      })
      teacherIds = teachers.map(teacher => teacher.id)
    }

    let refreshed = 0
    let withPhoto = 0
    for (const teacherId of teacherIds) {
      const hasPhoto = await refreshTeacherO365PhotoCache(teacherId)
      refreshed += 1
      if (hasPhoto) withPhoto += 1
    }

    return NextResponse.json({
      total: teacherIds.length,
      refreshed,
      withPhoto,
    })
  } catch (error) {
    captureError(error, {
      location: 'api/admin/teacher-photos/o365-refresh',
      type: 'refresh_o365_teacher_photos_error',
    })
    const message = error instanceof Error ? error.message : 'O365-Fotos konnten nicht aktualisiert werden'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
