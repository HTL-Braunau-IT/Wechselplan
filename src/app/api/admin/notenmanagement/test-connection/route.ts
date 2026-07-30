export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { getServiceCredentials } from '@/lib/notenmanagement/settings'
import { getNmToken, NmAuthError } from '@/lib/notenmanagement/server-client'

export async function POST() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized: admin role required' }, { status: 403 })
  }

  try {
    const creds = await getServiceCredentials()
    if (!creds) {
      return NextResponse.json({ error: 'No service account configured' }, { status: 400 })
    }

    const { role, userName } = await getNmToken(creds.username, creds.password)
    return NextResponse.json({ ok: true, role, userName })
  } catch (error) {
    // A rejected password is a normal outcome of a connection test, not a fault.
    if (error instanceof NmAuthError) {
      return NextResponse.json({ ok: false, error: 'Authentication failed' })
    }
    captureError(error, {
      location: 'api/admin/notenmanagement/test-connection',
      type: 'test_connection_error',
    })
    const message = error instanceof Error ? error.message : 'Notenmanagement request failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
