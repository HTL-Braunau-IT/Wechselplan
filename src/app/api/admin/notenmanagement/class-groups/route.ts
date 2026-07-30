export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { updateDirectorySyncSettings } from '@/lib/directory-sync-settings'
import { discoverClassGroups } from '@/lib/notenmanagement/class-group-discovery'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized: admin role required' }, { status: 403 })
  }

  try {
    const groups = await discoverClassGroups()
    return NextResponse.json(groups)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/notenmanagement/class-groups',
      type: 'discover_class_groups_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to discover class groups'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized: admin role required' }, { status: 403 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { groupIds?: unknown }

    if (
      !Array.isArray(body.groupIds) ||
      !body.groupIds.every(id => typeof id === 'string')
    ) {
      return NextResponse.json(
        { error: 'groupIds must be an array of strings' },
        { status: 400 },
      )
    }

    // The discovered class-group set is authoritative for these groups, so we
    // REPLACE the persisted synced class-group ids rather than merging.
    const settings = await updateDirectorySyncSettings({
      syncedClassGroupIds: body.groupIds as string[],
    })
    return NextResponse.json(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/notenmanagement/class-groups',
      type: 'update_class_groups_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to update class groups'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
