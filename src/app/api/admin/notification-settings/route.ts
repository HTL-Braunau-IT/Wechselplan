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
    const body = (await request.json().catch(() => ({}))) as { emailDigestEnabled?: unknown }
    if (typeof body.emailDigestEnabled !== 'boolean') {
      return NextResponse.json({ error: 'emailDigestEnabled must be a boolean' }, { status: 400 })
    }

    const settings = await setEmailDigestEnabled(body.emailDigestEnabled)
    return NextResponse.json(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/notification-settings',
      type: 'update_notification_settings_error',
    })
    return NextResponse.json({ error: 'Failed to update notification settings' }, { status: 500 })
  }
}
