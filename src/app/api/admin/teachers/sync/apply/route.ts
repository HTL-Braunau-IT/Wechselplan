export const runtime = 'nodejs'

import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { applyTeacherSync, type TeacherSyncSelection } from '@/lib/teacher-sync'
import { forbidden, ok, serverError } from '@/lib/api-response'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    console.warn('[teacher-sync/apply] rejected: caller is not an admin')
    return forbidden('Unauthorized: admin role required to run teacher sync')
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      selection?: TeacherSyncSelection
    }
    const summary = await applyTeacherSync(body.selection)
    return ok(summary)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/teachers/sync/apply',
      type: 'teacher_sync_apply_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to apply teacher sync'
    return serverError(message)
  }
}
