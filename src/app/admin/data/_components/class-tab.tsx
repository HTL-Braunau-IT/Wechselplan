'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw } from 'lucide-react'
import { ClassStudentSyncDialog } from './class-student-sync-dialog'

interface Class {
  id: number
  name: string
  description?: string
  classHeadId?: number
  classLeadId?: number
  externalId?: string | null
  externalSource?: string | null
  isActive?: boolean
  deactivatedAt?: string | null
  lastSyncedAt?: string | null
  createdAt: string
  updatedAt: string
  classHead?: { id: number; firstName: string; lastName: string }
  classLead?: { id: number; firstName: string; lastName: string }
}

export function ClassTab() {
  const [classes, setClasses] = useState<Class[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [teachers, setTeachers] = useState<{ id: number; firstName: string; lastName: string }[]>([])
  const [isSyncOpen, setIsSyncOpen] = useState(false)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
    { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
    { key: 'description', label: 'Beschreibung', type: 'textarea', sortable: true },
    { 
      key: 'classHeadId', 
      label: 'Klassenvorstand', 
      type: 'select', 
      options: [{ value: '', label: 'Kein Eintrag' }, ...teachers.map(t => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))],
      sortable: true
    },
    { 
      key: 'classLeadId', 
      label: 'Klassenleitung', 
      type: 'select', 
      options: [{ value: '', label: 'Kein Eintrag' }, ...teachers.map(t => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))],
      sortable: true
    },
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
      label: 'Entra group id',
      type: 'text',
      readonly: true,
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs">{(item.externalId as string | null | undefined) ?? '-'}</span>
      ),
    },
    { key: 'externalSource', label: 'Quelle', type: 'text', readonly: true, sortable: true },
    { key: 'lastSyncedAt', label: 'Zuletzt synchronisiert', type: 'date', readonly: true, sortable: true },
    { key: 'createdAt', label: 'Erstellt am', type: 'date', readonly: true, sortable: true },
    { key: 'updatedAt', label: 'Aktualisiert am', type: 'date', readonly: true, sortable: true }
  ]

  const fetchClasses = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=class')
      if (response.ok) {
        const data = await response.json() as Class[]
        setClasses(data)
      }
    } catch (error) {
      console.error('Error fetching classes:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchTeachers = async () => {
    try {
      const response = await fetch('/api/admin/data?model=teacher')
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>[]
        setTeachers(data.map((t: Record<string, unknown>) => ({ 
          id: t.id as number, 
          firstName: t.firstName as string, 
          lastName: t.lastName as string 
        })))
      }
    } catch (error) {
      console.error('Error fetching teachers:', error)
    }
  }

  useEffect(() => {
    void fetchClasses()
    void fetchTeachers()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=class', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Klasse konnte nicht erstellt werden')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=class', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Klasse konnte nicht aktualisiert werden')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=class&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Klasse konnte nicht gelöscht werden')
    }
  }

  const handleDeleteAll = async (): Promise<{ deleted?: Record<string, number> }> => {
    const response = await fetch('/api/admin/data?model=class&bulk=true', {
      method: 'DELETE'
    })

    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Klassen konnten nicht gelöscht werden')
    }

    return response.json() as Promise<{ deleted?: Record<string, number> }>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setIsSyncOpen(true)} variant="secondary">
          <RefreshCw className="mr-2 h-4 w-4" />
          Klassen + Schüler mit Entra synchronisieren
        </Button>
      </div>

      <DataTable
        model="Class"
        columns={columns}
        data={classes as unknown as Record<string, unknown>[]}
        onRefresh={fetchClasses}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDeleteAll={handleDeleteAll}
        deleteAllLabel="Alle Klassen löschen"
        onCreate={handleCreate}
        isLoading={isLoading}
      />

      <ClassStudentSyncDialog
        open={isSyncOpen}
        onOpenChange={setIsSyncOpen}
        onCompleted={() => {
          void fetchClasses()
        }}
      />
    </div>
  )
}
