'use client'

import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StudentPhoto } from '@/components/student-photo'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useAdminModel, useAdminModelMutations } from '@/hooks/use-admin-model'
import { ModelTab } from './model-tab'
import { ClassStudentSyncDialog } from './class-student-sync-dialog'
import { ActiveBadge, SyncStatusBadge } from './status-badge'
import { SYNC_COLUMNS, TIMESTAMP_COLUMNS } from './model-configs'
import type { Column } from './data-table'

export function StudentTab() {
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const [isSyncOpen, setIsSyncOpen] = useState(false)

  // Classes populate the class select in the create/edit form.
  const { data: classes } = useAdminModel('class', {
    schoolYearId,
    listUrl: schoolYearId != null ? `/api/classes?schoolYearId=${schoolYearId}` : undefined,
  })
  const { invalidate } = useAdminModelMutations('student', schoolYearId)

  const columns: Column[] = useMemo(
    () => [
      { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
      {
        key: 'photo',
        label: 'Foto',
        sortable: false,
        render: item => (
          <StudentPhoto
            studentId={item.id as number}
            firstName={(item.firstName as string) ?? ''}
            lastName={(item.lastName as string) ?? ''}
            size={28}
            avatarOnly
          />
        ),
      },
      { key: 'firstName', label: 'Vorname', type: 'text', required: true, sortable: true },
      { key: 'lastName', label: 'Nachname', type: 'text', required: true, sortable: true },
      { key: 'username', label: 'Benutzername', type: 'text', required: true, sortable: true },
      { key: 'email', label: 'E-Mail', type: 'text', sortable: true },
      {
        key: 'classId',
        label: 'Klasse',
        type: 'select',
        sortable: true,
        options: (classes ?? []).map(c => ({ value: c.id as number, label: c.name as string })),
      },
      { key: 'groupId', label: 'Gruppen-ID', type: 'number', sortable: true },
      {
        key: 'isActive',
        label: 'Status',
        type: 'boolean',
        readonly: true,
        sortable: true,
        render: item => <ActiveBadge isActive={item.isActive} />,
      },
      {
        key: 'syncStatus',
        label: 'Sync-Status',
        type: 'text',
        readonly: true,
        sortable: true,
        render: item => <SyncStatusBadge syncStatus={item.syncStatus} />,
      },
      ...SYNC_COLUMNS,
      ...TIMESTAMP_COLUMNS,
    ],
    [classes],
  )

  return (
    <ModelTab
      model="student"
      label="Schüler"
      columns={columns}
      schoolYearId={schoolYearId}
      // /api/admin/data ignores schoolYearId for students, so a year-scoped
      // view has to read from the students endpoint instead.
      listUrl={schoolYearId != null ? `/api/students/all?schoolYearId=${schoolYearId}` : undefined}
      allowDeleteAll
      deleteAllLabel="Alle Schüler löschen"
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
