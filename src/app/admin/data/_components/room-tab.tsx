'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface Room {
  id: number
  name: string
  capacity?: number
  description?: string
  createdAt: string
  updatedAt: string
}

export function RoomTab() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
    { key: 'name', label: 'Name', type: 'text', required: true, sortable: true },
    { key: 'capacity', label: 'Capacity', type: 'number', sortable: true },
    { key: 'description', label: 'Description', type: 'textarea', sortable: true },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true, sortable: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true, sortable: true }
  ]

  const fetchRooms = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=room')
      if (response.ok) {
        const data = await response.json() as Room[]
        setRooms(data)
      }
    } catch (error) {
      console.error('Error fetching rooms:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchRooms()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to create room')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=room', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to update room')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=room&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete room')
    }
  }

  return (
    <DataTable
      model="Room"
      columns={columns}
      data={rooms as unknown as Record<string, unknown>[]}
      onRefresh={fetchRooms}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
