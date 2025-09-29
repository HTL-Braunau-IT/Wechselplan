'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import { Column } from './data-table'

interface GroupAssignment {
  id: number
  groupId: number
  class: string
  createdAt: string
  updatedAt: string
}

export function GroupAssignmentTab() {
  const [groupAssignments, setGroupAssignments] = useState<GroupAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'groupId', label: 'Group ID', type: 'number', required: true },
    { key: 'class', label: 'Class', type: 'text', required: true },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchGroupAssignments = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=groupAssignment')
      if (response.ok) {
        const data = await response.json()
        setGroupAssignments(data)
      }
    } catch (error) {
      console.error('Error fetching group assignments:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchGroupAssignments()
  }, [])

  const handleCreate = async (data: any) => {
    const response = await fetch('/api/admin/data?model=groupAssignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create group assignment')
    }
    
    return response.json()
  }

  const handleEdit = async (data: any) => {
    const response = await fetch('/api/admin/data?model=groupAssignment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update group assignment')
    }
    
    return response.json()
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=groupAssignment&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete group assignment')
    }
  }

  return (
    <DataTable
      model="Group Assignment"
      columns={columns}
      data={groupAssignments}
      onRefresh={fetchGroupAssignments}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
