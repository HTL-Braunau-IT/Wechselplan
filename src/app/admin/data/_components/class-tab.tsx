'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface Class {
  id: number
  name: string
  description?: string
  classHeadId?: number
  classLeadId?: number
  createdAt: string
  updatedAt: string
  classHead?: { id: number; firstName: string; lastName: string }
  classLead?: { id: number; firstName: string; lastName: string }
}

export function ClassTab() {
  const [classes, setClasses] = useState<Class[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [teachers, setTeachers] = useState<{ id: number; firstName: string; lastName: string }[]>([])

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
    { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
    { key: 'description', label: 'Description', type: 'textarea', sortable: true },
    { 
      key: 'classHeadId', 
      label: 'Class Head', 
      type: 'select', 
      options: [{ value: '', label: 'None' }, ...teachers.map(t => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))],
      sortable: true
    },
    { 
      key: 'classLeadId', 
      label: 'Class Lead', 
      type: 'select', 
      options: [{ value: '', label: 'None' }, ...teachers.map(t => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))],
      sortable: true
    },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true, sortable: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true, sortable: true }
  ]

  const fetchClasses = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=class')
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>[]
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
      throw new Error(error.error ?? 'Failed to create class')
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
      throw new Error(error.error ?? 'Failed to update class')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=class&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete class')
    }
  }

  return (
    <DataTable
      model="Class"
      columns={columns}
      data={classes}
      onRefresh={fetchClasses}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
