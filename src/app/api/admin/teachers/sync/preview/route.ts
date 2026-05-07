export const runtime = 'nodejs'

import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { previewTeacherSync } from '@/lib/teacher-sync'
import { forbidden, ok, serverError } from '@/lib/api-response'

export async function POST() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    console.warn('[teacher-sync/preview] rejected: caller is not an admin')
    return forbidden('Unauthorized: admin role required to run teacher sync')
  }

  try {
    const diff = await previewTeacherSync()
    return ok(diff)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/teachers/sync/preview',
      type: 'teacher_sync_preview_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to preview teacher sync'
    return serverError(message)
  }
}
