export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { captureError } from '@/lib/sentry'
import { runFullDirectorySync } from '@/lib/directory-sync'

/**
 * Unattended entrypoint for the nightly directory sync.
 *
 * The sync mode setting ('hybrid' / 'nightly_only') was plumbed through the
 * database, the API and the settings UI, but nothing ever scheduled a run, so
 * 'nightly_only' meant "never syncs". This route is what an external scheduler
 * (cron, a systemd timer, a Kubernetes CronJob) calls.
 *
 * It authenticates with a shared secret rather than a session, because the
 * caller is a machine. Without SYNC_TRIGGER_SECRET set, the route stays off —
 * it does not fall back to running unauthenticated.
 *
 *   curl -X POST https://host/api/sync/run -H "x-sync-secret: $SYNC_TRIGGER_SECRET"
 */
export async function POST(request: Request) {
  const configured = process.env.SYNC_TRIGGER_SECRET?.trim()
  if (!configured) {
    return NextResponse.json(
      { error: 'Scheduled sync is not configured (SYNC_TRIGGER_SECRET is unset).' },
      { status: 503 },
    )
  }

  if (!isAuthorized(request, configured)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runFullDirectorySync({ trigger: 'scheduled' })
    // A refused or partly failed run must not look like success to the
    // scheduler, or a broken sync stays silent until someone opens the admin UI.
    const status = result.status === 'failed' ? 500 : result.status === 'partial' ? 207 : 200
    return NextResponse.json(result, { status })
  } catch (error) {
    captureError(error, { location: 'api/sync/run', type: 'scheduled_sync_error' })
    const message = error instanceof Error ? error.message : 'Scheduled sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function isAuthorized(request: Request, configured: string): boolean {
  const header = request.headers.get('x-sync-secret')
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const presented = (header ?? bearer ?? '').trim()
  if (!presented) return false

  const a = Buffer.from(presented)
  const b = Buffer.from(configured)
  // Compare lengths first; timingSafeEqual throws on a length mismatch.
  return a.length === b.length && timingSafeEqual(a, b)
}
