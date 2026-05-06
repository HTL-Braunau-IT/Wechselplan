export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { applyTeacherSync, type TeacherSyncSelection } from '@/lib/teacher-sync'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    console.warn('[teacher-sync/apply] rejected: caller is not an admin')
    return NextResponse.json(
      { error: 'Unauthorized: admin role required to run teacher sync' },
      { status: 403 },
    )
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      selection?: TeacherSyncSelection
    }
    const summary = await applyTeacherSync(body.selection)
    return NextResponse.json(summary)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/teachers/sync/apply',
      type: 'teacher_sync_apply_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to apply teacher sync'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
