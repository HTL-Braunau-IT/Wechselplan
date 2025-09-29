'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import { Column } from './data-table'

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
  const [students, setStudents] = useState<Student[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([])

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'firstName', label: 'First Name', type: 'text', required: true },
    { key: 'lastName', label: 'Last Name', type: 'text', required: true },
    { key: 'username', label: 'Username', type: 'text', required: true },
    { 
      key: 'classId', 
      label: 'Class', 
      type: 'select', 
      options: classes.map(c => ({ value: c.id, label: c.name }))
    },
    { key: 'groupId', label: 'Group ID', type: 'number' },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchStudents = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=student')
      if (response.ok) {
        const data = await response.json()
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
      const response = await fetch('/api/admin/data?model=class')
      if (response.ok) {
        const data = await response.json()
        setClasses(data.map((c: any) => ({ id: c.id, name: c.name })))
      }
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }

  useEffect(() => {
    fetchStudents()
    fetchClasses()
  }, [])

  const handleCreate = async (data: any) => {
    const response = await fetch('/api/admin/data?model=student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create student')
    }
    
    return response.json()
  }

  const handleEdit = async (data: any) => {
    const response = await fetch('/api/admin/data?model=student', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update student')
    }
    
    return response.json()
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=student&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete student')
    }
  }

  return (
    <DataTable
      model="Student"
      columns={columns}
      data={students}
      onRefresh={fetchStudents}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
