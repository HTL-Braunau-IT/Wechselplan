'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TeacherPhoto } from '@/components/teacher-photo'
import { ModelTab } from './model-tab'
import { TeacherSyncDialog } from './teacher-sync-dialog'
import { ActiveBadge } from './status-badge'
import { SYNC_COLUMNS, TIMESTAMP_COLUMNS } from './model-configs'
import type { Column } from './data-table'
import { useAdminModelMutations } from '@/hooks/use-admin-model'

const columns: Column[] = [
  {
    key: 'photo',
    label: 'Foto',
    type: 'text',
    readonly: true,
    render: item => (
      <TeacherPhoto
        teacherId={item.id as number}
        firstName={(item.firstName as string) ?? ''}
        lastName={(item.lastName as string) ?? ''}
        size={28}
      />
    ),
  },
  { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
  { key: 'firstName', label: 'Vorname', type: 'text', required: true, sortable: true },
  { key: 'lastName', label: 'Nachname', type: 'text', required: true, sortable: true },
  { key: 'username', label: 'Benutzername', type: 'text', required: true, sortable: true },
  { key: 'email', label: 'E-Mail', type: 'text', sortable: true },
  {
    key: 'isActive',
    label: 'Status',
    type: 'boolean',
    readonly: true,
    sortable: true,
    render: item => <ActiveBadge isActive={item.isActive} />,
  },
  ...SYNC_COLUMNS,
  ...TIMESTAMP_COLUMNS,
]

export function TeacherTab() {
  const [isSyncOpen, setIsSyncOpen] = useState(false)
  const { invalidate } = useAdminModelMutations('teacher')

  return (
    <ModelTab
      model="teacher"
      label="Lehrkraft"
      columns={columns}
      allowDeleteAll
      deleteAllLabel="Alle Lehrkräfte löschen"
      toolbar={
        <Button onClick={() => setIsSyncOpen(true)} variant="secondary">
          <RefreshCw className="mr-2 h-4 w-4" />
          Mit Entra synchronisieren
        </Button>
      }
    >
      <TeacherSyncDialog
        open={isSyncOpen}
        onOpenChange={setIsSyncOpen}
        onCompleted={() => void invalidate()}
      />
    </ModelTab>
  )
}
