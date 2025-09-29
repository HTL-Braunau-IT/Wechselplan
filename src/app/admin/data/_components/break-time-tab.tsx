'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface BreakTime {
  id: number
  name: string
  startTime: string
  endTime: string
  period: string
  createdAt: string
  updatedAt: string
}

export function BreakTimeTab() {
  const [breakTimes, setBreakTimes] = useState<BreakTime[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'startTime', label: 'Start Time', type: 'text', required: true },
    { key: 'endTime', label: 'End Time', type: 'text', required: true },
    { key: 'period', label: 'Period', type: 'text', required: true },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchBreakTimes = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=breakTime')
      if (response.ok) {
        const data = await response.json() as BreakTime[]
        setBreakTimes(data)
      }
    } catch (error) {
      console.error('Error fetching break times:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchBreakTimes()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=breakTime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to create break time')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=breakTime', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to update break time')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=breakTime&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete break time')
    }
  }

  return (
    <DataTable
      model="Break Time"
      columns={columns}
      data={breakTimes as unknown as Record<string, unknown>[]}
      onRefresh={fetchBreakTimes}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
