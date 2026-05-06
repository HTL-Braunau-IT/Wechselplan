export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { previewTeacherSync } from '@/lib/teacher-sync'

export async function POST() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    console.warn('[teacher-sync/preview] rejected: caller is not an admin')
    return NextResponse.json(
      { error: 'Unauthorized: admin role required to run teacher sync' },
      { status: 403 },
    )
  }

  try {
    const diff = await previewTeacherSync()
    return NextResponse.json(diff)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/teachers/sync/preview',
      type: 'teacher_sync_preview_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to preview teacher sync'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
