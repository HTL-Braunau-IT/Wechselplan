'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import { Column } from './data-table'

interface TeacherRotation {
  id: number
  classId: number
  groupId: number
  teacherId: number
  turnId: string
  period: string
  createdAt: string
  updatedAt: string
}

export function TeacherRotationTab() {
  const [teacherRotations, setTeacherRotations] = useState<TeacherRotation[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { key: 'classId', label: 'Class ID', type: 'number', required: true },
    { key: 'groupId', label: 'Group ID', type: 'number', required: true },
    { key: 'teacherId', label: 'Teacher ID', type: 'number', required: true },
    { key: 'turnId', label: 'Turn ID', type: 'text', required: true },
    { key: 'period', label: 'Period', type: 'text', required: true },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchTeacherRotations = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=teacherRotation')
      if (response.ok) {
        const data = await response.json()
        setTeacherRotations(data)
      }
    } catch (error) {
      console.error('Error fetching teacher rotations:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTeacherRotations()
  }, [])

  const handleCreate = async (data: any) => {
    const response = await fetch('/api/admin/data?model=teacherRotation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create teacher rotation')
    }
    
    return response.json()
  }

  const handleEdit = async (data: any) => {
    const response = await fetch('/api/admin/data?model=teacherRotation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update teacher rotation')
    }
    
    return response.json()
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=teacherRotation&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete teacher rotation')
    }
  }

  return (
    <DataTable
      model="Teacher Rotation"
      columns={columns}
      data={teacherRotations}
      onRefresh={fetchTeacherRotations}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
