export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import { collectGroups, type EntraGroup } from '@/lib/graph'

function isMailEnabledSecurityGroup(group: EntraGroup): boolean {
  return group.mailEnabled === true && group.securityEnabled === true
}

function isWindowsServerAdSourced(group: EntraGroup): boolean {
  // Azure/Entra uses onPremisesSyncEnabled=true for objects synced from AD DS.
  return group.onPremisesSyncEnabled === true
}

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'Unauthorized: admin role required' },
      { status: 403 },
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()

    const groups: EntraGroup[] = await collectGroups({
      filter: q ? `startswith(displayName,'${q.replace(/'/g, "''")}')` : undefined,
    })

    const eligibleGroups = groups.filter(
      group => isWindowsServerAdSourced(group) && isMailEnabledSecurityGroup(group),
    )

    const sorted = eligibleGroups.slice().sort((a, b) =>
      (a.displayName ?? '').localeCompare(b.displayName ?? '', undefined, {
        sensitivity: 'base',
      }),
    )

    return NextResponse.json(sorted)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/entra/groups',
      type: 'list_entra_groups_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to list Entra groups'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
