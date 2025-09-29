'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import type { Column } from './data-table'

interface TeacherAssignment {
  id: number
  classId: number
  period: string
  groupId: number
  teacherId: number
  subjectId: number
  learningContentId: number
  roomId: number
  selectedWeekday: number
  createdAt: string
  updatedAt: string
  teacher?: { id: number; firstName: string; lastName: string }
  class?: { id: number; name: string }
  subject?: { id: number; name: string }
  learningContent?: { id: number; name: string }
  room?: { id: number; name: string }
}

export function TeacherAssignmentTab() {
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [teachers, setTeachers] = useState<{ id: number; firstName: string; lastName: string }[]>([])
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([])
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([])
  const [learningContents, setLearningContents] = useState<{ id: number; name: string }[]>([])
  const [rooms, setRooms] = useState<{ id: number; name: string }[]>([])

  const columns: Column[] = [
    { key: 'id', label: 'ID', type: 'number', readonly: true },
    { 
      key: 'classId', 
      label: 'Class', 
      type: 'select', 
      required: true,
      options: classes.map(c => ({ value: c.id, label: c.name }))
    },
    { key: 'period', label: 'Period', type: 'text', required: true },
    { key: 'groupId', label: 'Group ID', type: 'number', required: true },
    { 
      key: 'teacherId', 
      label: 'Teacher', 
      type: 'select', 
      required: true,
      options: teachers.map(t => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))
    },
    { 
      key: 'subjectId', 
      label: 'Subject', 
      type: 'select', 
      required: true,
      options: subjects.map(s => ({ value: s.id, label: s.name }))
    },
    { 
      key: 'learningContentId', 
      label: 'Learning Content', 
      type: 'select', 
      required: true,
      options: learningContents.map(lc => ({ value: lc.id, label: lc.name }))
    },
    { 
      key: 'roomId', 
      label: 'Room', 
      type: 'select', 
      required: true,
      options: rooms.map(r => ({ value: r.id, label: r.name }))
    },
    { key: 'selectedWeekday', label: 'Selected Weekday', type: 'number', required: true },
    { key: 'createdAt', label: 'Created At', type: 'date', readonly: true },
    { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true }
  ]

  const fetchTeacherAssignments = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/admin/data?model=teacherAssignment')
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>[]
        setTeacherAssignments(data)
      }
    } catch (error) {
      console.error('Error fetching teacher assignments:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchRelatedData = async () => {
    try {
      const [teachersRes, classesRes, subjectsRes, learningContentsRes, roomsRes] = await Promise.all([
        fetch('/api/admin/data?model=teacher'),
        fetch('/api/admin/data?model=class'),
        fetch('/api/admin/data?model=subject'),
        fetch('/api/admin/data?model=learningContent'),
        fetch('/api/admin/data?model=room')
      ])

      if (teachersRes.ok) {
        const data = await teachersRes.json() as Record<string, unknown>[]
        setTeachers(data.map((t: Record<string, unknown>) => ({ 
          id: t.id as number, 
          firstName: t.firstName as string, 
          lastName: t.lastName as string 
        })))
      }
      if (classesRes.ok) {
        const data = await classesRes.json() as Record<string, unknown>[]
        setClasses(data.map((c: Record<string, unknown>) => ({ 
          id: c.id as number, 
          name: c.name as string 
        })))
      }
      if (subjectsRes.ok) {
        const data = await subjectsRes.json() as Record<string, unknown>[]
        setSubjects(data.map((s: Record<string, unknown>) => ({ 
          id: s.id as number, 
          name: s.name as string 
        })))
      }
      if (learningContentsRes.ok) {
        const data = await learningContentsRes.json() as Record<string, unknown>[]
        setLearningContents(data.map((lc: Record<string, unknown>) => ({ 
          id: lc.id as number, 
          name: lc.name as string 
        })))
      }
      if (roomsRes.ok) {
        const data = await roomsRes.json() as Record<string, unknown>[]
        setRooms(data.map((r: Record<string, unknown>) => ({ 
          id: r.id as number, 
          name: r.name as string 
        })))
      }
    } catch (error) {
      console.error('Error fetching related data:', error)
    }
  }

  useEffect(() => {
    void fetchTeacherAssignments()
    void fetchRelatedData()
  }, [])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=teacherAssignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to create teacher assignment')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=teacherAssignment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to update teacher assignment')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=teacherAssignment&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete teacher assignment')
    }
  }

  return (
    <DataTable
      model="Teacher Assignment"
      columns={columns}
      data={teacherAssignments}
      onRefresh={fetchTeacherAssignments}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onCreate={handleCreate}
      isLoading={isLoading}
    />
  )
}
