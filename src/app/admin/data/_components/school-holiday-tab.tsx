'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface SchoolHoliday {
  id: number
  name: string
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
}

export function SchoolHolidayTab() {
  const [schoolHolidays, setSchoolHolidays] = useState<SchoolHoliday[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'startDate', label: 'Start Date', type: 'date', required: true },
    { key: 'endDate', label: 'End Date', type: 'date', required: true },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchSchoolHolidays = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=schoolHoliday')
      if (response.ok) {
        const data = await response.json() as SchoolHoliday[]
        setSchoolHolidays(data)
      }
    } catch (error) {
      console.error('Error fetching school holidays:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchSchoolHolidays()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=schoolHoliday', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to create school holiday')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=schoolHoliday', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to update school holiday')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=schoolHoliday&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete school holiday')
    }
  }

  return (
    <DataTable
      model="School Holiday"
      columns={columns}
      data={schoolHolidays as unknown as Record<string, unknown>[]}
      onRefresh={fetchSchoolHolidays}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
