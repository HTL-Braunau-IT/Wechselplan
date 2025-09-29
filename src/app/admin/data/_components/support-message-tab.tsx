'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import { Column } from './data-table'

interface SupportMessage {
  id: number
  name: string
  message: string
  currentUri?: string
  createdAt: string
  updatedAt: string
}

export function SupportMessageTab() {
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'message', label: 'Message', type: 'textarea', required: true },
    { key: 'currentUri', label: 'Current URI', type: 'text' },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchSupportMessages = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=supportMessage')
      if (response.ok) {
        const data = await response.json()
        setSupportMessages(data)
      }
    } catch (error) {
      console.error('Error fetching support messages:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSupportMessages()
  }, [])

  const handleCreate = async (data: any) => {
    const response = await fetch('/api/admin/data?model=supportMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create support message')
    }
    
    return response.json()
  }

  const handleEdit = async (data: any) => {
    const response = await fetch('/api/admin/data?model=supportMessage', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update support message')
    }
    
    return response.json()
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=supportMessage&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete support message')
    }
  }

  return (
    <DataTable
      model="Support Message"
      columns={columns}
      data={supportMessages}
      onRefresh={fetchSupportMessages}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
