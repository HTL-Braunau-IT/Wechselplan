'use client'

import { useState, useEffect } from 'react'
import { DataTable } from './data-table'
import { Column } from './data-table'

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
        const data = await response.json()
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
        const data = await teachersRes.json()
        setTeachers(data.map((t: any) => ({ id: t.id, firstName: t.firstName, lastName: t.lastName })))
      }
      if (classesRes.ok) {
        const data = await classesRes.json()
        setClasses(data.map((c: any) => ({ id: c.id, name: c.name })))
      }
      if (subjectsRes.ok) {
        const data = await subjectsRes.json()
        setSubjects(data.map((s: any) => ({ id: s.id, name: s.name })))
      }
      if (learningContentsRes.ok) {
        const data = await learningContentsRes.json()
        setLearningContents(data.map((lc: any) => ({ id: lc.id, name: lc.name })))
      }
      if (roomsRes.ok) {
        const data = await roomsRes.json()
        setRooms(data.map((r: any) => ({ id: r.id, name: r.name })))
      }
    } catch (error) {
      console.error('Error fetching related data:', error)
    }
  }

  useEffect(() => {
    fetchTeacherAssignments()
    fetchRelatedData()
  }, [])

  const handleCreate = async (data: any) => {
    const response = await fetch('/api/admin/data?model=teacherAssignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to create teacher assignment')
    }
    
    return response.json()
  }

  const handleEdit = async (data: any) => {
    const response = await fetch('/api/admin/data?model=teacherAssignment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to update teacher assignment')
    }
    
    return response.json()
  }

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/admin/data?model=teacherAssignment&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to delete teacher assignment')
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
