'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { DataTable } from './data-table'
import type { Column } from './data-table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { CheckCircle, XCircle, Upload } from 'lucide-react'
import { toast } from 'sonner'

interface Student {
  id: number
  firstName: string
  lastName: string
  username: string
  classId?: number
  groupId?: number
  createdAt: string
  updatedAt: string
  class?: {
    id: number
    name: string
    description?: string
  }
}

const CHUNK_SIZE = 100

function StudentPhotoCell({
  studentId,
  hasPhoto,
  onUploadComplete
}: {
  studentId: number
  hasPhoto: boolean
  onUploadComplete: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    e.target.value = ''
    try {
      const formData = new FormData()
      formData.set('studentId', String(studentId))
      formData.append('files', file)
      const response = await fetch('/api/admin/student-photos/upload', {
        method: 'POST',
        body: formData
      })
      const data = (await response.json()) as { results?: { success: boolean; error?: string }[] }
      if (response.ok && data.results?.[0]?.success) {
        toast.success('Photo uploaded')
        onUploadComplete()
      } else {
        toast.error(data.results?.[0]?.error ?? 'Upload failed')
      }
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {hasPhoto ? (
        <CheckCircle className="h-5 w-5 shrink-0 text-green-600" aria-label="Has photo" />
      ) : (
        <XCircle className="h-5 w-5 shrink-0 text-destructive" aria-label="No photo" />
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        className="hidden"
        onChange={handleUpload}
        disabled={uploading}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        <Upload className="h-4 w-4" />
      </Button>
    </div>
  )
}

export function StudentTab() {
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const [students, setStudents] = useState<Student[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([])
  const [hasPhotoMap, setHasPhotoMap] = useState<Map<number, boolean>>(new Map())
  const [photoFilter, setPhotoFilter] = useState<'all' | 'hasPhoto' | 'noPhoto'>('all')

  const fetchPhotoCheck = async (studentIds: number[]) => {
    if (studentIds.length === 0) return
    const chunks: number[][] = []
    for (let i = 0; i < studentIds.length; i += CHUNK_SIZE) {
      chunks.push(studentIds.slice(i, i + CHUNK_SIZE))
    }
    const out = new Map<number, boolean>()
    for (const chunk of chunks) {
      const ids = chunk.join(',')
      const response = await fetch(`/api/students/photo/check?ids=${encodeURIComponent(ids)}`, {
        cache: 'no-store'
      })
      if (!response.ok) continue
      const data = (await response.json()) as Record<string, boolean>
      for (const [id, has] of Object.entries(data)) {
        out.set(parseInt(id, 10), has)
      }
    }
    setHasPhotoMap((prev) => new Map([...prev, ...out]))
  }

  const filteredStudents = useMemo(() => {
    if (photoFilter === 'all') return students
    return students.filter((s) => {
      const has = hasPhotoMap.get(s.id)
      if (photoFilter === 'hasPhoto') return has === true
      return has !== true
    })
  }, [students, photoFilter, hasPhotoMap])

  const columns: Column[] = useMemo(
    () => [
      { key: 'id', label: 'ID', type: 'number', readonly: true, sortable: true },
      {
        key: 'photo',
        label: 'Photo',
        sortable: false,
        render: (item) => (
          <StudentPhotoCell
            studentId={item.id as number}
            hasPhoto={hasPhotoMap.get(item.id as number) === true}
            onUploadComplete={() => fetchPhotoCheck([item.id as number])}
          />
        )
      },
      { key: 'firstName', label: 'First Name', type: 'text', required: true, sortable: true },
      { key: 'lastName', label: 'Last Name', type: 'text', required: true, sortable: true },
      { key: 'username', label: 'Username', type: 'text', required: true, sortable: true },
      {
        key: 'classId',
        label: 'Class',
        type: 'select',
        options: classes.map((c) => ({ value: c.id, label: c.name })),
        sortable: true
      },
      { key: 'groupId', label: 'Group ID', type: 'number', sortable: true },
      { key: 'createdAt', label: 'Created At', type: 'date', readonly: true, sortable: true },
      { key: 'updatedAt', label: 'Updated At', type: 'date', readonly: true, sortable: true }
    ],
    [classes, hasPhotoMap]
  )

  const fetchStudents = async () => {
    try {
      setIsLoading(true)
      if (schoolYearId != null) {
        const response = await fetch(`/api/students/all?schoolYearId=${schoolYearId}`, { cache: 'no-store' })
        if (response.ok) {
          const data = await response.json() as unknown as Student[]
          setStudents(data)
        }
      } else {
        const response = await fetch('/api/admin/data?model=student')
        if (response.ok) {
          const data = await response.json() as unknown as Student[]
          setStudents(data)
        }
      }
    } catch (error) {
      console.error('Error fetching students:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchClasses = async () => {
    try {
      const url = schoolYearId != null ? `/api/classes?schoolYearId=${schoolYearId}` : '/api/admin/data?model=class'
      const response = await fetch(url, schoolYearId != null ? { cache: 'no-store' } : undefined)
      if (response.ok) {
        const data = await response.json() as Array<{ id: number; name: string }>
        setClasses(data.map(c => ({ id: c.id, name: c.name })))
      }
    } catch (error) {
      console.error('Error fetching classes:', error)
    }
  }

  useEffect(() => {
    void fetchStudents()
    void fetchClasses()
  }, [schoolYearId])

  useEffect(() => {
    if (students.length === 0) return
    void fetchPhotoCheck(students.map((s) => s.id))
  }, [students])

  const handleCreate = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=student', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to create student')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleEdit = async (data: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const response = await fetch('/api/admin/data?model=student', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to update student')
    }
    
    return response.json() as Promise<Record<string, unknown>>
  }

  const handleDelete = async (id: number): Promise<void> => {
    const response = await fetch(`/api/admin/data?model=student&id=${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      const error = await response.json() as { error?: string }
      throw new Error(error.error ?? 'Failed to delete student')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="photo-filter" className="text-sm">
            Photo
          </Label>
          <Select value={photoFilter} onValueChange={(v) => setPhotoFilter(v as 'all' | 'hasPhoto' | 'noPhoto')}>
            <SelectTrigger id="photo-filter" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="hasPhoto">Has photo</SelectItem>
              <SelectItem value="noPhoto">No photo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DataTable
        model="Student"
        columns={columns}
        data={filteredStudents as unknown as Record<string, unknown>[]}
        onRefresh={() => {
          void fetchStudents()
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreate={handleCreate}
        isLoading={isLoading}
      />
    </div>
  )
}
