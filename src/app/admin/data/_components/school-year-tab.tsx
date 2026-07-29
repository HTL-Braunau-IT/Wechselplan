'use client'

import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { useAdminModelMutations } from '@/hooks/use-admin-model'
import { ModelTab } from './model-tab'
import { MODEL_CONFIGS } from './model-configs'
import type { Column } from './data-table'

const CONFIG = MODEL_CONFIGS['school-years']

/**
 * School-years CRUD, plus an in-table toggle for the active year.
 *
 * `isCurrent` is the authoritative "current school year" flag (see
 * resolveCurrentSchoolYear). Rather than make admins open the edit dialog and
 * tick a checkbox, the flag gets a Switch right in the table. Setting one year
 * current clears the others server-side (single-current invariant in
 * /api/admin/data), and the shared query cache refetches so the other rows flip
 * off on their own.
 */
export function SchoolYearTab() {
  const { update } = useAdminModelMutations(CONFIG.model)

  const setCurrent = async (row: Record<string, unknown>, next: boolean) => {
    try {
      await update({ ...row, isCurrent: next })
      toast.success(
        next
          ? `${String(row.label)} als aktuelles Schuljahr gesetzt`
          : `${String(row.label)} ist nicht mehr das aktuelle Schuljahr`,
      )
    } catch {
      toast.error('Aktuelles Schuljahr konnte nicht geändert werden')
    }
  }

  // Swap the plain boolean `isCurrent` cell for an interactive Switch. Giving a
  // column a `render` also drops it from the create/edit dialogs, so the toggle
  // is the single way to set the current year.
  const columns: Column[] = CONFIG.columns.map(column =>
    column.key === 'isCurrent'
      ? {
          ...column,
          render: (row: Record<string, unknown>) => (
            <Switch
              checked={Boolean(row.isCurrent)}
              onCheckedChange={next => void setCurrent(row, next === true)}
              aria-label={`${String(row.label)} als aktuelles Schuljahr setzen`}
            />
          ),
        }
      : column,
  )

  return <ModelTab model={CONFIG.model} label={CONFIG.label} columns={columns} />
}
