export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { refreshStudentO365PhotoCache } from '@/lib/student-photo-source'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'Nicht berechtigt: Admin-Rolle erforderlich' },
      { status: 403 },
    )
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { studentIds?: unknown }
    let studentIds: number[]

    if (Array.isArray(body.studentIds) && body.studentIds.length > 0) {
      studentIds = body.studentIds
        .map(id => (typeof id === 'number' ? id : Number.NaN))
        .filter(id => Number.isInteger(id) && id > 0)
    } else {
      const students = await prisma.student.findMany({
        where: { externalSource: 'entra', externalId: { not: null } },
        select: { id: true },
        take: 1000,
      })
      studentIds = students.map(student => student.id)
    }

    let refreshed = 0
    let withPhoto = 0
    for (const studentId of studentIds) {
      const hasPhoto = await refreshStudentO365PhotoCache(studentId)
      refreshed += 1
      if (hasPhoto) withPhoto += 1
    }

    return NextResponse.json({
      total: studentIds.length,
      refreshed,
      withPhoto,
    })
  } catch (error) {
    captureError(error, {
      location: 'api/admin/student-photos/o365-refresh',
      type: 'refresh_o365_student_photos_error',
    })
    const message =
      error instanceof Error ? error.message : 'O365-Fotos konnten nicht aktualisiert werden'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
