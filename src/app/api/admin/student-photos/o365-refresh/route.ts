export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-admin'
import { captureError } from '@/lib/sentry'
import { refreshO365Photos } from '@/lib/o365-photo-refresh'

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
    const result = await refreshO365Photos('student', body.studentIds)
    return NextResponse.json(result)
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
