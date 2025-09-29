'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface ScheduleTime {
  id: number
  startTime: string
  endTime: string
  hours: number
  period: string
  createdAt: string
  updatedAt: string
}

export function ScheduleTimeTab() {
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'startTime', label: 'Start Time', type: 'text', required: true },
    { key: 'endTime', label: 'End Time', type: 'text', required: true },
    { key: 'hours', label: 'Hours', type: 'number', required: true },
    { key: 'period', label: 'Period', type: 'text', required: true },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchScheduleTimes = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=scheduleTime')
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>[]
        setScheduleTimes(data)
      }
    } catch (error) {
      console.error('Error fetching schedule times:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchScheduleTimes()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=scheduleTime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to create schedule time')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=scheduleTime', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to update schedule time')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=scheduleTime&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete schedule time')
    }
  }

  return (
    <DataTable
      model="Schedule Time"
      columns={columns}
      data={scheduleTimes}
      onRefresh={fetchScheduleTimes}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
