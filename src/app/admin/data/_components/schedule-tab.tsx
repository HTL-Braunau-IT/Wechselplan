'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface Schedule {
  id: number
  name: string
  description?: string
  startDate: string
  endDate: string
  selectedWeekday: number
  scheduleData: Record<string, unknown>
  additionalInfo?: string
  semesterPlanning?: string
  classId?: number
  createdAt: string
  updatedAt: string
  class?: { id: number; name: string }
}

export function ScheduleTab() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([])

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'startDate', label: 'Start Date', type: 'date', required: true },
    { key: 'endDate', label: 'End Date', type: 'date', required: true },
    { key: 'selectedWeekday', label: 'Selected Weekday', type: 'number', required: true },
    { 
      key: 'classId', 
      label: 'Class', 
      type: 'select', 
      options: [{ value: '', label: 'None' }, ...classes.map(c => ({ value: c.id, label: c.name }))]
    },
    { key: 'semesterPlanning', label: 'Semester Planning', type: 'text' },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchSchedules = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=schedule')
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>[]
        setSchedules(data)
      }
    } catch (error) {
      console.error('Error fetching schedules:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchClasses = async () => {
    try {
      const response = await fetch('/api/admin/data?model=class')
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>[]
        setClasses(data.map((c: Record<string, unknown>) => ({ 
          id: c.id as number, 
          name: c.name as string 
        })))
      }
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }

  useEffect(() => {
    void fetchSchedules()
    void fetchClasses()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to create schedule')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to update schedule')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=schedule&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete schedule')
    }
  }

  return (
    <DataTable
      model="Schedule"
      columns={columns}
      data={schedules}
      onRefresh={fetchSchedules}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
