export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { applyClassStudentSync, type ClassStudentSyncSelection } from '@/lib/class-student-sync'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    console.warn('[class-sync/apply] rejected: caller is not an admin')
    return NextResponse.json(
      { error: 'Unauthorized: admin role required to run class/student sync' },
      { status: 403 },
    )
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      schoolYearId?: number
      selection?: ClassStudentSyncSelection
    }
    const summary = await applyClassStudentSync(body.selection, {
      schoolYearId: typeof body.schoolYearId === 'number' ? body.schoolYearId : undefined,
      // The mass-deactivation guard exists for the unattended nightly run,
      // where nobody sees the diff. Here an admin has just reviewed the
      // preview and ticked the rows, so enforcing it would only leave them
      // unable to apply a legitimately large change (end of school year).
      maxDeactivationRatio: null,
    })
    return NextResponse.json(summary)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/class-sync/apply',
      type: 'class_sync_apply_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to apply class/student sync'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
