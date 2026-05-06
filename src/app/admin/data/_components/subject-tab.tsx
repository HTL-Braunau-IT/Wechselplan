'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

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
    { key: 'createdAt', label: 'Erstellt am', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Aktualisiert am', type: 'date', readonly: true }
  ]

  const fetchSubjects = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=subject')
      if (response.ok) {
        const data = await response.json() as Subject[]
        setSubjects(data)
      }
    } catch (error) {
      console.error('Error fetching subjects:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchSubjects()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=subject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Erstellen fehlgeschlagen subject')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=subject', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Aktualisieren fehlgeschlagen subject')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=subject&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Löschen fehlgeschlagen subject')
    }
  }

  return (
    <DataTable
      model="Subject"
      columns={columns}
      data={subjects as unknown as Record<string, unknown>[]}
      onRefresh={fetchSubjects}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
