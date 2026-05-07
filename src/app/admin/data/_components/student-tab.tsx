'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { DataTable } from './data-table'
import type { Column } from './data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { RefreshCw } from 'lucide-react'
import { ClassStudentSyncDialog } from './class-student-sync-dialog'
import { StudentPhoto } from '@/components/student-photo'
import { adminGet, adminWrite } from './admin-data-client'

interface Student {
  id: number
  firstName: string
  lastName: string
  username: string
  email?: string | null
  classId?: number
  groupId?: number
  externalId?: string | null
  externalSource?: string | null
  isActive?: boolean
  deactivatedAt?: string | null
  lastSyncedAt?: string | null
  syncStatus?: string | null
  createdAt: string
  updatedAt: string
  class?: {
    id: number
    name: string
    description?: string
  }
}

export function StudentTab() {
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const [students, setStudents] = useState<Student[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([])
  const [isSyncOpen, setIsSyncOpen] = useState(false)

  const columns: Column[] = useMemo(
    () => [
      { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
      {
        key: 'photo',
        label: 'Foto',
        sortable: false,
        render: (item) => (
          <StudentPhoto
            studentId={item.id as number}
            firstName={(item.firstName as string) ?? ''}
            lastName={(item.lastName as string) ?? ''}
            size={28}
            avatarOnly
            lazy
          />
        )
      },
      { key: 'firstName', label: 'Vorname', type: 'text', required: true, sortable: true },
      { key: 'lastName', label: 'Nachname', type: 'text', required: true, sortable: true },
      { key: 'username', label: 'Benutzername', type: 'text', required: true, sortable: true },
      { key: 'email', label: 'Email', type: 'text', sortable: true },
      {
        key: 'classId',
        label: 'Klasse',
        type: 'select',
        options: classes.map((c) => ({ value: c.id, label: c.name })),
        sortable: true
      },
      { key: 'groupId', label: 'Gruppen-ID', type: 'number', sortable: true },
      {
        key: 'isActive',
        label: 'Aktiv',
        type: 'boolean',
        readonly: true,
        sortable: true,
        render: (item) => (
          <Badge variant={item.isActive === false ? 'outline' : 'default'}>
            {item.isActive === false ? 'inaktiv' : 'aktiv'}
          </Badge>
        ),
      },
      {
        key: 'externalId',
        label: 'Entra oid',
        type: 'text',
        readonly: true,
        sortable: true,
        render: (item) => (
          <span className="font-mono text-xs">
            {(item.externalId as string | null | undefined) ?? '-'}
          </span>
        ),
      },
      { key: 'externalSource', label: 'Quelle', type: 'text', readonly: true, sortable: true },
      { key: 'lastSyncedAt', label: 'Zuletzt synchronisiert', type: 'date', readonly: true, sortable: true },
      { key: 'createdAt', label: 'Erstellt am', type: 'date', readonly: true, sortable: true },
      { key: 'updatedAt', label: 'Aktualisiert am', type: 'date', readonly: true, sortable: true }
    ],
    [classes]
  )

  const fetchStudents = async () => {
    try {
      setIsLoading(true)
      if (schoolYearId != null) {
        const data = await adminGet<Student[]>(`/api/students/all?schoolYearId=${schoolYearId}`)
        setStudents(data)
      } else {
        const data = await adminGet<Student[]>('/api/admin/data?model=student')
        setStudents(data)
      }
    } catch (error) {
      console.error('Error fetching students:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchClasses = async () => {
    try {
      const url = schoolYearId != null ? `/api/classes?schoolYearId=${schoolYearId}` : '/api/admin/data?model=class'
      const data = await adminGet<Array<{ id: number; name: string }>>(url)
      setClasses(data.map(c => ({ id: c.id, name: c.name })))
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }

  useEffect(() => {
    void fetchStudents()
    void fetchClasses()
  }, [schoolYearId])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    return adminWrite<Record<string, unknown>>('/api/admin/data?model=student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    return adminWrite<Record<string, unknown>>('/api/admin/data?model=student', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }

  const handleDelete = async (id: number): Promise<void> => {
    await adminWrite<null>(`/api/admin/data?model=student&id=${id}`, {
      method: 'DELETE'
    })
  }

  const handleDeleteAll = async (): Promise<{ deleted?: Record<string, number> }> => {
    return adminWrite<{ deleted?: Record<string, number> }>('/api/admin/data?model=student&bulk=true', {
      method: 'DELETE'
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="ml-auto">
          <Button onClick={() => setIsSyncOpen(true)} variant="secondary">
            <RefreshCw className="mr-2 h-4 w-4" />
            Klassen + Schüler mit Entra synchronisieren
          </Button>
        </div>
      </div>
      <DataTable
        model="Student"
        columns={columns}
        data={students as unknown as Record<string, unknown>[]}
        onRefresh={() => {
          void fetchStudents()
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDeleteAll={handleDeleteAll}
        deleteAllLabel="Alle Schüler löschen"
        onCreate={handleCreate}
        isLoading={isLoading}
      />

      <ClassStudentSyncDialog
        open={isSyncOpen}
        onOpenChange={setIsSyncOpen}
        onCompleted={() => {
          void fetchStudents()
        }}
      />
    </div>
  )
}
