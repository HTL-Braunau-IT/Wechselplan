'use client'

import { Badge } from '@/components/ui/badge'

/**
 * Renders the soft-delete lifecycle state. Student, Teacher and Class tables
 * each had their own inline copy of this, and they disagreed on how to treat a
 * missing value: two rendered `isActive === false ? 'inaktiv' : 'aktiv'` while
 * the third rendered `isActive ? … : 'inaktiv'`, so an undefined value showed
 * as active in two tables and inactive in the third.
 */
export function ActiveBadge({ isActive }: { isActive: unknown }) {
  const active = isActive !== false
  return <Badge variant={active ? 'default' : 'outline'}>{active ? 'aktiv' : 'inaktiv'}</Badge>
}

/**
 * Shows why a synced student has no class. Only rendered when sync recorded
 * something other than the normal 'active' state.
 */
export function SyncStatusBadge({ syncStatus }: { syncStatus: unknown }) {
  if (typeof syncStatus !== 'string' || !syncStatus || syncStatus === 'active') {
    return <span className="text-muted-foreground">–</span>
  }

  if (syncStatus === 'unassigned') {
    return (
      <Badge variant="destructive" title="In mehreren synchronisierten Klassengruppen">
        keine Klasse
      </Badge>
    )
  }

  return <Badge variant="outline">{syncStatus}</Badge>
}
