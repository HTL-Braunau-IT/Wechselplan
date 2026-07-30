export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { previewNmLinkSync, runNmLinkSync, NmLinkSyncConfigError } from '@/lib/notenmanagement/link-sync'
import { NmAuthError } from '@/lib/notenmanagement/server-client'

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized: admin role required' }, { status: 403 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { preview?: unknown }
    const preview = body.preview === true

    const summary = preview ? await previewNmLinkSync() : await runNmLinkSync()
    return NextResponse.json(summary)
  } catch (error) {
    if (error instanceof NmLinkSyncConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof NmAuthError) {
      return NextResponse.json(
        { error: 'Anmeldung am Notenmanagement-Dienstkonto fehlgeschlagen. Bitte Zugangsdaten prüfen.' },
        { status: 400 },
      )
    }
    captureError(error, {
      location: 'api/admin/notenmanagement/link-sync',
      type: 'link_sync_error',
    })
    const message = error instanceof Error ? error.message : 'Link sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
