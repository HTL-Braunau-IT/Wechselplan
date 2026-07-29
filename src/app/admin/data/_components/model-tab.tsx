'use client'

import type { ReactNode } from 'react'
import { DataTable, type Column } from './data-table'
import { useAdminModel, useAdminModelMutations } from '@/hooks/use-admin-model'

interface ModelTabProps {
  /** Prisma model name as accepted by /api/admin/data, e.g. "learningContent". */
  model: string
  /** Human-facing label used in dialog titles and the delete-all prompt. */
  label: string
  columns: Column[]
  schoolYearId?: number
  /** See {@link UseAdminModelOptions.listUrl}. */
  listUrl?: string
  /** Extra controls rendered above the table, e.g. a sync button. */
  toolbar?: ReactNode
  /** Offer the bulk-delete action, labelled with {@link deleteAllLabel}. */
  allowDeleteAll?: boolean
  deleteAllLabel?: string
  /** Rendered after the table, e.g. a sync dialog. */
  children?: ReactNode
}

/**
 * The whole of a standard admin CRUD tab.
 *
 * Fourteen tab components differed only in a TypeScript interface, a columns
 * array, and the model name repeated in four fetch URLs and three error
 * strings. Everything else — the state, the effect, the three handlers, the
 * DataTable wiring — was copied verbatim, which is why flags like `sortable`
 * had drifted between otherwise identical tables.
 */
export function ModelTab({
  model,
  label,
  columns,
  schoolYearId,
  listUrl,
  toolbar,
  allowDeleteAll = false,
  deleteAllLabel,
  children,
}: ModelTabProps) {
  const { data, isLoading, refetch } = useAdminModel(model, { schoolYearId, listUrl })
  const { create, update, remove, removeAll } = useAdminModelMutations(model, schoolYearId)

  return (
    <div className="space-y-4">
      {toolbar ? <div className="flex items-center justify-end gap-2">{toolbar}</div> : null}
      <DataTable
        model={label}
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        onRefresh={() => void refetch()}
        onCreate={create}
        onEdit={update}
        onDelete={remove}
        onDeleteAll={allowDeleteAll ? removeAll : undefined}
        deleteAllLabel={deleteAllLabel}
      />
      {children}
    </div>
  )
}
