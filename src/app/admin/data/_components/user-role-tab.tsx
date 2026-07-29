'use client'

import { useMemo } from 'react'
import { ModelTab } from './model-tab'
import type { Column } from './data-table'
import { useAdminModel } from '@/hooks/use-admin-model'

/**
 * User roles are a standard CRUD table apart from one thing: the role column is
 * a select whose options come from the Role table, so the available roles have
 * to be loaded alongside.
 */
export function UserRoleTab() {
  const { data: roles } = useAdminModel('role')

  const columns: Column[] = useMemo(
    () => [
      { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
      { key: 'userId', label: 'Benutzer', type: 'text', required: true, sortable: true },
      {
        key: 'roleId',
        label: 'Rolle',
        type: 'select',
        required: true,
        sortable: true,
        options: (roles ?? []).map(role => ({
          value: role.id as number,
          label: role.name as string,
        })),
      },
      { key: 'createdAt', label: 'Erstellt am', type: 'date', readonly: true, sortable: true },
      { key: 'updatedAt', label: 'Aktualisiert am', type: 'date', readonly: true, sortable: true },
    ],
    [roles],
  )

  return <ModelTab model="userRole" label="Benutzerrolle" columns={columns} />
}
