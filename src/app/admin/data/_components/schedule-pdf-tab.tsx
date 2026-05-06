'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface SchedulePDF {
  id: string
  classId: string
  pdfData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export function SchedulePDFTab() {
  const [schedulePDFs, setSchedulePDFs] = useState<SchedulePDF[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'text', readonly: true },
    { key: 'classId', label: 'Class ID', type: 'text', required: true },
    { key: 'createdAt', label: 'Erstellt am', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Aktualisiert am', type: 'date', readonly: true }
  ]

  const fetchSchedulePDFs = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=schedulePDF')
      if (response.ok) {
        const data = await response.json() as SchedulePDF[]
        setSchedulePDFs(data)
      }
    } catch (error) {
      console.error('Error fetching schedule PDFs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchSchedulePDFs()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=schedulePDF', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Erstellen fehlgeschlagen schedule PDF')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=schedulePDF', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Aktualisieren fehlgeschlagen schedule PDF')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=schedulePDF&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Löschen fehlgeschlagen schedule PDF')
    }
  }

  return (
    <DataTable
      model="Schedule PDF"
      columns={columns}
      data={schedulePDFs as unknown as Record<string, unknown>[]}
      onRefresh={fetchSchedulePDFs}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
