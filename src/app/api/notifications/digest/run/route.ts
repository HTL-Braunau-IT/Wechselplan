export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { captureError } from '@/lib/sentry'
import { isEmailDigestEnabled } from '@/lib/notification-settings'
import { runNotificationDigest } from '@/lib/notification-digest'

/**
 * Unattended entrypoint for the daily unacknowledged-notification e-mail digest
 * (issue #96). An external scheduler (cron, systemd timer, K8s CronJob) calls
 * this once a day.
 *
 * It authenticates with the same shared secret as the directory-sync trigger
 * (`SYNC_TRIGGER_SECRET`) rather than a session, because the caller is a
 * machine. Without the secret set the route stays off — it never falls back to
 * running unauthenticated. Whether it actually mails anything is gated a second
 * time by the admin master switch (NotificationSettings.emailDigestEnabled),
 * so an operator can leave the cron wired and still turn the feature off.
 *
 *   curl -X POST https://host/api/notifications/digest/run -H "x-sync-secret: $SYNC_TRIGGER_SECRET"
 */
export async function POST(request: Request) {
  const configured = process.env.SYNC_TRIGGER_SECRET?.trim()
  if (!configured) {
    return NextResponse.json(
      { error: 'Digest is not configured (SYNC_TRIGGER_SECRET is unset).' },
      { status: 503 },
    )
  }

  if (!isAuthorized(request, configured)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!(await isEmailDigestEnabled())) {
      return NextResponse.json({ skipped: true, reason: 'email digest disabled' })
    }
    const summary = await runNotificationDigest()
    const status = summary.failures > 0 ? 207 : 200
    return NextResponse.json({ skipped: false, summary }, { status })
  } catch (error) {
    captureError(error, { location: 'api/notifications/digest/run', type: 'digest_error' })
    const message = error instanceof Error ? error.message : 'Digest run failed'
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
