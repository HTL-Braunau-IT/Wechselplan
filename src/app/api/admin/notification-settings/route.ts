export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { getNotificationSettings, setEmailDigestEnabled } from '@/lib/notification-settings'

/** GET /api/admin/notification-settings — current notification settings. */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized: admin role required' }, { status: 403 })
  }

  try {
    const settings = await getNotificationSettings()
    return NextResponse.json(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/notification-settings',
      type: 'get_notification_settings_error',
    })
    return NextResponse.json({ error: 'Failed to load notification settings' }, { status: 500 })
  }
}

/** PUT /api/admin/notification-settings — flip the e-mail digest master switch. */
export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized: admin role required' }, { status: 403 })
  }

  try {
    // `request.json()` happily parses a bare `null` (or an array) without
    // throwing, so guard the shape before reading the property — otherwise a
    // `null` body would throw on access and report a 500 for what is a 400.
    const body: unknown = await request.json().catch(() => null)
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      typeof (body as { emailDigestEnabled?: unknown }).emailDigestEnabled !== 'boolean'
    ) {
      return NextResponse.json({ error: 'emailDigestEnabled must be a boolean' }, { status: 400 })
    }

    const settings = await setEmailDigestEnabled(
      (body as { emailDigestEnabled: boolean }).emailDigestEnabled,
    )
    return NextResponse.json(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/notification-settings',
      type: 'update_notification_settings_error',
    })
    return NextResponse.json({ error: 'Failed to update notification settings' }, { status: 500 })
  }
}
