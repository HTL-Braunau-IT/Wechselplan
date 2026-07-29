'use client'

import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdminModel, useAdminModelMutations } from '@/hooks/use-admin-model'
import { ModelTab } from './model-tab'
import { ClassStudentSyncDialog } from './class-student-sync-dialog'
import { ActiveBadge } from './status-badge'
import { SYNC_COLUMNS, TIMESTAMP_COLUMNS } from './model-configs'
import type { Column } from './data-table'

export function ClassTab() {
  const [isSyncOpen, setIsSyncOpen] = useState(false)
  const { data: teachers } = useAdminModel('teacher')
  const { invalidate } = useAdminModelMutations('class')

  const columns: Column[] = useMemo(() => {
    const teacherOptions = [
      { value: '', label: 'Kein Eintrag' },
      ...(teachers ?? []).map(t => ({
        value: t.id as number,
        label: `${t.firstName as string} ${t.lastName as string}`,
      })),
    ]

    return [
      { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
      { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { key: 'description', label: 'Beschreibung', type: 'textarea', sortable: true },
      {
        key: 'classHeadId',
        label: 'Klassenvorstand',
        type: 'select',
        options: teacherOptions,
        sortable: true,
      },
      {
        key: 'classLeadId',
        label: 'Klassenleitung',
        type: 'select',
        options: teacherOptions,
        sortable: true,
      },
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
  }, [teachers])

  return (
    <ModelTab
      model="class"
      label="Klasse"
      columns={columns}
      toolbar={
        <Button onClick={() => setIsSyncOpen(true)} variant="secondary">
          <RefreshCw className="mr-2 h-4 w-4" />
          Klassen + Schüler mit Entra synchronisieren
        </Button>
      }
    >
      <ClassStudentSyncDialog
        open={isSyncOpen}
        onOpenChange={setIsSyncOpen}
        onCompleted={() => void invalidate()}
      />
    </ModelTab>
  )
}
