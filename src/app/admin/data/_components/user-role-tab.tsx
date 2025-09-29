'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import { Column } from './data-table'

interface UserRole {
  id: number
  userId: string
  roleId: number
  createdAt: string
  updatedAt: string
  role?: { id: number; name: string }
}

export function UserRoleTab() {
  const [userRoles, setUserRoles] = useState<UserRole[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([])

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'userId', label: 'User ID', type: 'text', required: true },
    { 
      key: 'roleId', 
      label: 'Role', 
      type: 'select', 
      required: true,
      options: roles.map(r => ({ value: r.id, label: r.name }))
    },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchUserRoles = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=userRole')
      if (response.ok) {
        const data = await response.json()
        setUserRoles(data)
      }
    } catch (error) {
      console.error('Error fetching user roles:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchRoles = async () => {
    try {
      const response = await fetch('/api/admin/data?model=role')
      if (response.ok) {
        const data = await response.json()
        setRoles(data.map((r: any) => ({ id: r.id, name: r.name })))
      }
    } catch (error) {
      console.error('Error fetching roles:', error)
    }
  }

  useEffect(() => {
    fetchUserRoles()
    fetchRoles()
  }, [])

  const handleCreate = async (data: any) => {
    const response = await fetch('/api/admin/data?model=userRole', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create user role')
    }
    
    return response.json()
  }

  const handleEdit = async (data: any) => {
    const response = await fetch('/api/admin/data?model=userRole', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update user role')
    }
    
    return response.json()
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=userRole&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete user role')
    }
  }

  return (
    <DataTable
      model="User Role"
      columns={columns}
      data={userRoles}
      onRefresh={fetchUserRoles}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
