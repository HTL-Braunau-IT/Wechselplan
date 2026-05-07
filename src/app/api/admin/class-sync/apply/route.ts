export const runtime = 'nodejs'

import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import {
  applyClassStudentSync,
  type ClassStudentSyncSelection,
} from '@/lib/class-student-sync'
import { forbidden, ok, serverError } from '@/lib/api-response'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    console.warn('[class-sync/apply] rejected: caller is not an admin')
    return forbidden('Unauthorized: admin role required to run class/student sync')
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      schoolYearId?: number
      selection?: ClassStudentSyncSelection
    }
    const summary = await applyClassStudentSync(body.selection, {
      schoolYearId: typeof body.schoolYearId === 'number' ? body.schoolYearId : undefined,
    })
    return ok(summary)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/class-sync/apply',
      type: 'class_sync_apply_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to apply class/student sync'
    return serverError(message)
  }
}
