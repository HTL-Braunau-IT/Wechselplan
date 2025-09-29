'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import { Column } from './data-table'

interface Subject {
  id: number
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

export function SubjectTab() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchSubjects = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=subject')
      if (response.ok) {
        const data = await response.json()
        setSubjects(data)
      }
    } catch (error) {
      console.error('Error fetching subjects:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSubjects()
  }, [])

  const handleCreate = async (data: any) => {
    const response = await fetch('/api/admin/data?model=subject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create subject')
    }
    
    return response.json()
  }

  const handleEdit = async (data: any) => {
    const response = await fetch('/api/admin/data?model=subject', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update subject')
    }
    
    return response.json()
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=subject&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete subject')
    }
  }

  return (
    <DataTable
      model="Subject"
      columns={columns}
      data={subjects}
      onRefresh={fetchSubjects}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
