export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import {
  getNotenmanagementSettings,
  updateServiceCredentials,
} from '@/lib/notenmanagement/settings'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized: admin role required' }, { status: 403 })
  }

  try {
    const settings = await getNotenmanagementSettings()
    return NextResponse.json(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/notenmanagement-settings',
      type: 'get_notenmanagement_settings_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to load Notenmanagement settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized: admin role required' }, { status: 403 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      serviceUsername?: unknown
      servicePassword?: unknown
    }

    if (body.serviceUsername !== undefined && typeof body.serviceUsername !== 'string') {
      return NextResponse.json({ error: 'serviceUsername must be a string' }, { status: 400 })
    }
    if (body.servicePassword !== undefined && typeof body.servicePassword !== 'string') {
      return NextResponse.json({ error: 'servicePassword must be a string' }, { status: 400 })
    }

    await updateServiceCredentials({
      username: body.serviceUsername as string | undefined,
      password: body.servicePassword as string | undefined,
    })

    const settings = await getNotenmanagementSettings()
    return NextResponse.json(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/notenmanagement-settings',
      type: 'update_notenmanagement_settings_error',
    })
    const message =
      error instanceof Error ? error.message : 'Failed to update Notenmanagement settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
