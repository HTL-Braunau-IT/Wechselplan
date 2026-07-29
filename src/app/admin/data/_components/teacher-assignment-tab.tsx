'use client'

import { useMemo } from 'react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useAdminModel, type AdminModelRow } from '@/hooks/use-admin-model'
import { ModelTab } from './model-tab'
import { TIMESTAMP_COLUMNS } from './model-configs'
import type { Column } from './data-table'

/** Maps rows onto `{ value, label }` options for a select column. */
function toOptions(
  rows: AdminModelRow[] | undefined,
  label: (row: AdminModelRow) => string,
): { value: number; label: string }[] {
  return (rows ?? []).map(row => ({ value: row.id as number, label: label(row) }))
}

export function TeacherAssignmentTab() {
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id

  // Five lookup tables feed the select columns. Sharing the query cache with
  // the other tabs means opening this one after Rooms or Subjects is instant.
  const { data: teachers } = useAdminModel('teacher')
  const { data: classes } = useAdminModel('class')
  const { data: subjects } = useAdminModel('subject')
  const { data: learningContents } = useAdminModel('learningContent')
  const { data: rooms } = useAdminModel('room')

  const columns: Column[] = useMemo(
    () => [
      { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
      {
        key: 'classId',
        label: 'Klasse',
        type: 'select',
        required: true,
        sortable: true,
        options: toOptions(classes, row => row.name as string),
      },
      { key: 'period', label: 'Zeitraum', type: 'text', required: true, sortable: true },
      { key: 'groupId', label: 'Gruppen-ID', type: 'number', required: true, sortable: true },
      {
        key: 'teacherId',
        label: 'Lehrkraft',
        type: 'select',
        required: true,
        sortable: true,
        options: toOptions(teachers, row => `${row.firstName as string} ${row.lastName as string}`),
      },
      {
        key: 'subjectId',
        label: 'Fach',
        type: 'select',
        required: true,
        sortable: true,
        options: toOptions(subjects, row => row.name as string),
      },
      {
        key: 'learningContentId',
        label: 'Lehrinhalt',
        type: 'select',
        required: true,
        sortable: true,
        options: toOptions(learningContents, row => row.name as string),
      },
      {
        key: 'roomId',
        label: 'Raum',
        type: 'select',
        required: true,
        sortable: true,
        options: toOptions(rooms, row => row.name as string),
      },
      {
        key: 'selectedWeekday',
        label: 'Wochentag',
        type: 'number',
        required: true,
        sortable: true,
      },
      ...TIMESTAMP_COLUMNS,
    ],
    [classes, teachers, subjects, learningContents, rooms],
  )

  return (
    <ModelTab
      model="teacherAssignment"
      label="Lehrkraftzuordnung"
      columns={columns}
      schoolYearId={schoolYearId}
    />
  )
}
