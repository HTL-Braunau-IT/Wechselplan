'use client'

import { useMemo } from 'react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useAdminModel } from '@/hooks/use-admin-model'
import { ModelTab } from './model-tab'
import { TIMESTAMP_COLUMNS } from './model-configs'
import type { Column } from './data-table'

export function ScheduleTab() {
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const { data: classes } = useAdminModel('class')

  const columns: Column[] = useMemo(
    () => [
      { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
      { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
      { key: 'description', label: 'Beschreibung', type: 'textarea', sortable: true },
      { key: 'startDate', label: 'Beginn', type: 'date', required: true, sortable: true },
      { key: 'endDate', label: 'Ende', type: 'date', required: true, sortable: true },
      {
        key: 'selectedWeekday',
        label: 'Wochentag',
        type: 'number',
        required: true,
        sortable: true,
      },
      {
        key: 'classId',
        label: 'Klasse',
        type: 'select',
        sortable: true,
        options: [
          { value: '', label: 'Kein Eintrag' },
          ...(classes ?? []).map(c => ({ value: c.id as number, label: c.name as string })),
        ],
      },
      { key: 'semesterPlanning', label: 'Semesterplanung', type: 'text', sortable: true },
      ...TIMESTAMP_COLUMNS,
    ],
    [classes],
  )

  return (
    <ModelTab model="schedule" label="Stundenplan" columns={columns} schoolYearId={schoolYearId} />
  )
}
