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
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchSchedulePDFs = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=schedulePDF')
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>[]
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
      throw new Error(error.error ?? 'Failed to create schedule PDF')
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
      throw new Error(error.error ?? 'Failed to update schedule PDF')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: string): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=schedulePDF&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete schedule PDF')
    }
  }

  return (
    <DataTable
      model="Schedule PDF"
      columns={columns}
      data={schedulePDFs}
      onRefresh={fetchSchedulePDFs}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
