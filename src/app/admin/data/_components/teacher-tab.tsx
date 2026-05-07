'use client'

import { useEffect, useState } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw } from 'lucide-react'
import { TeacherSyncDialog } from './teacher-sync-dialog'
import { TeacherPhoto } from '@/components/teacher-photo'
import { adminGet, adminWrite } from './admin-data-client'

interface Teacher {
  id: number
  firstName: string
  lastName: string
  username: string
  email?: string | null
  externalId?: string | null
  externalSource?: string | null
  isActive?: boolean
  deactivatedAt?: string | null
  lastSyncedAt?: string | null
  createdAt: string
  updatedAt: string
  headYears?: Record<string, unknown>[]
  leadYears?: Record<string, unknown>[]
  assignments?: Record<string, unknown>[]
}

export function TeacherTab() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncOpen, setIsSyncOpen] = useState(false)

  const columns: Column[] = [
    {
      key: 'photo',
      label: 'Foto',
      type: 'text',
      readonly: true,
      render: (item) => (
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
    { key: 'email', label: 'Email', type: 'text', sortable: true },
    {
      key: 'isActive',
      label: 'Aktiv',
      type: 'boolean',
      readonly: true,
      sortable: true,
      render: (item) => (
        <Badge variant={item.isActive ? 'default' : 'outline'}>
          {item.isActive ? 'aktiv' : 'inaktiv'}
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
        <span className="font-mono text-xs">{(item.externalId as string | null | undefined) ?? '-'}</span>
      ),
    },
    {
      key: 'externalSource',
      label: 'Quelle',
      type: 'text',
      readonly: true,
      sortable: true,
    },
    {
      key: 'lastSyncedAt',
      label: 'Zuletzt synchronisiert',
      type: 'date',
      readonly: true,
      sortable: true,
    },
    { key: 'createdAt', label: 'Erstellt am', type: 'date', readonly: true, sortable: true },
    { key: 'updatedAt', label: 'Aktualisiert am', type: 'date', readonly: true, sortable: true },
  ]

  const fetchTeachers = async () => {
    try {
      setIsLoading(true)
      const data = await adminGet<Teacher[]>('/api/admin/data?model=teacher')
      setTeachers(data)
    } catch (error) {
      console.error('Fehler beim Laden der Lehrkräfte:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchTeachers()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    return adminWrite<Record<string, unknown>>('/api/admin/data?model=teacher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    return adminWrite<Record<string, unknown>>('/api/admin/data?model=teacher', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }

  const handleDelete = async (id: number): Promise<void> => {
    await adminWrite<null>(`/api/admin/data?model=teacher&id=${id}`, {
      method: 'DELETE'
    })
  }

  const handleDeleteAll = async (): Promise<{ deleted?: Record<string, number> }> => {
    return adminWrite<{ deleted?: Record<string, number> }>('/api/admin/data?model=teacher&bulk=true', {
      method: 'DELETE'
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setIsSyncOpen(true)} variant="secondary">
          <RefreshCw className="mr-2 h-4 w-4" />
          Mit Entra synchronisieren
        </Button>
      </div>

      <DataTable
        model="Lehrkraft"
        columns={columns}
        data={teachers as unknown as Record<string, unknown>[]}
        onRefresh={fetchTeachers}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDeleteAll={handleDeleteAll}
        deleteAllLabel="Alle Lehrkräfte löschen"
        onCreate={handleCreate}
        isLoading={isLoading}
      />

      <TeacherSyncDialog
        open={isSyncOpen}
        onOpenChange={setIsSyncOpen}
        onCompleted={() => {
          void fetchTeachers()
        }}
      />
    </div>
  )
}
