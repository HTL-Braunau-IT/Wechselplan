'use client'

import { useEffect, useState } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'
import { adminGet, adminWrite } from './admin-data-client'

interface ClassYearStaff {
  id: number
  classId: number
  schoolYearId: number
  classHeadId: number | null
  classLeadId: number | null
  createdAt: string
  updatedAt: string
  class?: { id: number; name: string }
  schoolYear?: { id: number; label: string }
  classHead?: { id: number; firstName: string; lastName: string } | null
  classLead?: { id: number; firstName: string; lastName: string } | null
}

export function ClassYearStaffTab() {
  const [rows, setRows] = useState<ClassYearStaff[]>([])
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([])
  const [schoolYears, setSchoolYears] = useState<{ id: number; label: string }[]>([])
  const [teachers, setTeachers] = useState<{ id: number; firstName: string; lastName: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const teacherOptions = [
    { value: '', label: 'Kein Eintrag' },
    ...teachers.map(t => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))
  ]

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
    {
      key: 'classId',
      label: 'Klasse',
      type: 'select',
      required: true,
      options: classes.map(c => ({ value: c.id, label: c.name })),
      sortable: true,
      render: (item) => (item.class as { name?: string } | undefined)?.name ?? String(item.classId)
    },
    {
      key: 'schoolYearId',
      label: 'Schuljahr',
      type: 'select',
      required: true,
      options: schoolYears.map(y => ({ value: y.id, label: y.label })),
      sortable: true,
      render: (item) => (item.schoolYear as { label?: string } | undefined)?.label ?? String(item.schoolYearId)
    },
    {
      key: 'classHeadId',
      label: 'Klassenvorstand',
      type: 'select',
      options: teacherOptions,
      sortable: true,
      render: (item) => {
        const head = item.classHead as { firstName?: string; lastName?: string } | null | undefined
        return head ? `${head.firstName ?? ''} ${head.lastName ?? ''}`.trim() : '—'
      }
    },
    {
      key: 'classLeadId',
      label: 'Klassenleitung',
      type: 'select',
      options: teacherOptions,
      sortable: true,
      render: (item) => {
        const lead = item.classLead as { firstName?: string; lastName?: string } | null | undefined
        return lead ? `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() : '—'
      }
    },
    { key: 'createdAt', label: 'Erstellt am', type: 'date', readonly: true, sortable: true },
    { key: 'updatedAt', label: 'Aktualisiert am', type: 'date', readonly: true, sortable: true }
  ]

  const fetchAll = async () => {
    setIsLoading(true)
    try {
      const [rowsData, classesData, yearsData, teachersData] = await Promise.all([
        adminGet<ClassYearStaff[]>('/api/admin/data?model=classYearStaff'),
        adminGet<Record<string, unknown>[]>('/api/admin/data?model=class'),
        adminGet<Record<string, unknown>[]>('/api/admin/data?model=schoolYear'),
        adminGet<Record<string, unknown>[]>('/api/admin/data?model=teacher')
      ])
      setRows(rowsData)
      setClasses(classesData.map(c => ({ id: c.id as number, name: c.name as string })))
      setSchoolYears(yearsData.map(y => ({ id: y.id as number, label: y.label as string })))
      setTeachers(teachersData.map(t => ({
        id: t.id as number,
        firstName: t.firstName as string,
        lastName: t.lastName as string
      })))
    } catch (error) {
      console.error('Error fetching class year staff data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchAll()
  }, [])

  const handleCreate = async (data: Record<string, unknown>) =>
    adminWrite<Record<string, unknown>>('/api/admin/data?model=classYearStaff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

  const handleEdit = async (data: Record<string, unknown>) =>
    adminWrite<Record<string, unknown>>('/api/admin/data?model=classYearStaff', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

  const handleDelete = async (id: number) => {
    await adminWrite<null>(`/api/admin/data?model=classYearStaff&id=${id}`, {
      method: 'DELETE'
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
        Verwalte Klassenvorstand und Klassenleitung pro Schuljahr. Die Klassen-Tabelle zeigt nur den Eintrag des aktuellen Schuljahres.
      </div>

      <DataTable
        model="ClassYearStaff"
        columns={columns}
        data={rows as unknown as Record<string, unknown>[]}
        onRefresh={fetchAll}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreate={handleCreate}
        isLoading={isLoading}
      />
    </div>
  )
}
