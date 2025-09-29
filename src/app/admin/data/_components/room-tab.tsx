'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import { Column } from './data-table'

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
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'capacity', label: 'Capacity', type: 'number' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchRooms = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=room')
      if (response.ok) {
        const data = await response.json()
        setRooms(data)
      }
    } catch (error) {
      console.error('Error fetching rooms:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()
  }, [])

  const handleCreate = async (data: any) => {
    const response = await fetch('/api/admin/data?model=room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create room')
    }
    
    return response.json()
  }

  const handleEdit = async (data: any) => {
    const response = await fetch('/api/admin/data?model=room', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update room')
    }
    
    return response.json()
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=room&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete room')
    }
  }

  return (
    <DataTable
      model="Room"
      columns={columns}
      data={rooms}
      onRefresh={fetchRooms}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
