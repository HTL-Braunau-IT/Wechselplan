'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface Teacher {
  id: number
  firstName: string
  lastName: string
  username: string
  email?: string
  createdAt: string
  updatedAt: string
  headClasses?: Record<string, unknown>[]
  leadClasses?: Record<string, unknown>[]
  assignments?: Record<string, unknown>[]
}

export function TeacherTab() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
    { key: 'firstName', label: 'First Name', type: 'text', required: true, sortable: true },
    { key: 'lastName', label: 'Last Name', type: 'text', required: true, sortable: true },
    { key: 'username', label: 'Username', type: 'text', required: true, sortable: true },
    { key: 'email', label: 'Email', type: 'text', sortable: true },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true, sortable: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true, sortable: true }
  ]

  const fetchTeachers = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=teacher')
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>[]
        setTeachers(data)
      }
    } catch (error) {
      console.error('Error fetching teachers:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchTeachers()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=teacher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to create teacher')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=teacher', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to update teacher')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=teacher&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete teacher')
    }
  }

  return (
    <DataTable
      model="Teacher"
      columns={columns}
      data={teachers}
      onRefresh={fetchTeachers}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
