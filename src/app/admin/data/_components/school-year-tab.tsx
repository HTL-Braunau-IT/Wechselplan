'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface SchoolYear {
  id: number
  label: string
  startDate: string
  endDate: string
  semesterChangeDate: string
  isCurrent: boolean | null
  createdAt: string
  updatedAt: string
}

export function SchoolYearTab() {
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'label', label: 'Label', type: 'text', required: true },
    { key: 'startDate', label: 'Start Date', type: 'date', required: true },
    { key: 'endDate', label: 'End Date', type: 'date', required: true },
    { key: 'semesterChangeDate', label: 'Semester Change Date', type: 'date', required: true },
    { key: 'isCurrent', label: 'Is Current', type: 'boolean' },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchSchoolYears = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=schoolYear')
      if (response.ok) {
        const data = (await response.json()) as SchoolYear[]
        setSchoolYears(data)
      }
    } catch (error) {
      console.error('Error fetching school years:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchSchoolYears()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=schoolYear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const error = (await response.json()) as { error?: string }
      throw new Error(error.error ?? 'Failed to create school year')
    }

    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=schoolYear', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const error = (await response.json()) as { error?: string }
      throw new Error(error.error ?? 'Failed to update school year')
    }

    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=schoolYear&id=${id}`, {
      method: 'DELETE'
    })

    if (!response.ok) {
      const error = (await response.json()) as { error?: string }
      throw new Error(error.error ?? 'Failed to delete school year')
    }
  }

  return (
    <DataTable
      model="School Year"
      columns={columns}
      data={schoolYears as unknown as Record<string, unknown>[]}
      onRefresh={fetchSchoolYears}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
