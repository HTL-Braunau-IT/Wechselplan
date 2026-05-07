export const runtime = 'nodejs'

import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { previewClassStudentSync } from '@/lib/class-student-sync'
import { forbidden, ok, serverError } from '@/lib/api-response'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    console.warn('[class-sync/preview] rejected: caller is not an admin')
    return forbidden('Unauthorized: admin role required to run class/student sync')
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      schoolYearId?: number
    }
    const diff = await previewClassStudentSync({
      schoolYearId: typeof body.schoolYearId === 'number' ? body.schoolYearId : undefined,
    })
    return ok(diff)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/class-sync/preview',
      type: 'class_sync_preview_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to preview class/student sync'
    return serverError(message)
  }
}
