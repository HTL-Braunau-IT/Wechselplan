'use client'

import { useState, useEffect } from 'react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface Student {
  id: number
  firstName: string
  lastName: string
  username: string
  classId?: number
  groupId?: number
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

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
    { key: 'firstName', label: 'First Name', type: 'text', required: true, sortable: true },
    { key: 'lastName', label: 'Last Name', type: 'text', required: true, sortable: true },
    { key: 'username', label: 'Username', type: 'text', required: true, sortable: true },
    { 
      key: 'classId', 
      label: 'Class', 
      type: 'select', 
      options: classes.map(c => ({ value: c.id, label: c.name })),
      sortable: true
    },
    { key: 'groupId', label: 'Group ID', type: 'number', sortable: true },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true, sortable: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true, sortable: true }
  ]

  const fetchStudents = async () => {
    try {
      setIsLoading(true)
      if (schoolYearId != null) {
        const response = await fetch(`/api/students/all?schoolYearId=${schoolYearId}`, { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json() as unknown as Student[]
          setStudents(data)
        }
      } else {
        const response = await fetch('/api/admin/data?model=student')
        if (response.ok) {
          const data = await response.json() as unknown as Student[]
          setStudents(data)
        }
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
      const response = await fetch(url, schoolYearId != null ? { cache: 'no-store' } : undefined)
      if (response.ok) {
        const data = await response.json() as Array<{ id: number; name: string }>
        setClasses(data.map(c => ({ id: c.id, name: c.name })))
      }
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }

  useEffect(() => {
    void fetchStudents()
    void fetchClasses()
  }, [schoolYearId])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to create student')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=student', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to update student')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=student&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete student')
    }
  }

  return (
    <DataTable
      model="Student"
      columns={columns}
      data={students as unknown as Record<string, unknown>[]}
      onRefresh={fetchStudents}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
