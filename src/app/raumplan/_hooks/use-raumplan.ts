'use client'

import { useQuery } from '@tanstack/react-query'
import type { StudentPlacementResult, WeekOccupancy } from '@/lib/raumplan/types'

const FIVE_MIN = 1000 * 60 * 5

function withYear(params: URLSearchParams, schoolYearId?: number) {
  if (schoolYearId != null) params.set('schoolYearId', String(schoolYearId))
  return params
}

/** Full Mon–Fr × AM/PM room-occupancy grid for the week containing `week`. */
export function useWeekOccupancy(week: string | null, schoolYearId?: number) {
  return useQuery<WeekOccupancy>({
    queryKey: ['raumplan', 'week', week ?? 'today', schoolYearId ?? null],
    queryFn: async () => {
      const params = withYear(new URLSearchParams(), schoolYearId)
      if (week) params.set('week', week)
      const res = await fetch(`/api/raumplan?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch room occupancy')
      return res.json() as Promise<WeekOccupancy>
    },
    staleTime: FIVE_MIN,
  })
}

/** "Where should I be?" for one student on a date. */
export function useStudentPlacement(
  studentId: number | null,
  date: string | null,
  schoolYearId?: number,
) {
  return useQuery<StudentPlacementResult>({
    queryKey: ['raumplan', 'student', studentId, date ?? 'today', schoolYearId ?? null],
    queryFn: async () => {
      const params = withYear(new URLSearchParams(), schoolYearId)
      params.set('studentId', String(studentId))
      if (date) params.set('date', date)
      const res = await fetch(`/api/raumplan/student?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch student placement')
      return res.json() as Promise<StudentPlacementResult>
    },
    enabled: studentId != null,
    staleTime: FIVE_MIN,
  })
}

export interface ClassOption {
  id: number
  name: string
  isCombined: boolean
}

/** Classes for the student-view picker (reuses the shared /api/classes list). */
export function useClassList() {
  return useQuery<ClassOption[]>({
    queryKey: ['raumplan', 'classes'],
    queryFn: async () => {
      const res = await fetch('/api/classes')
      if (!res.ok) throw new Error('Failed to fetch classes')
      return res.json() as Promise<ClassOption[]>
    },
    staleTime: FIVE_MIN,
  })
}

export interface StudentOption {
  id: number
  firstName: string
  lastName: string
  class: string
}

/** Students of a class for the student-view picker (staff /api/students list). */
export function useClassStudents(className: string | null) {
  return useQuery<StudentOption[]>({
    queryKey: ['raumplan', 'class-students', className],
    queryFn: async () => {
      const res = await fetch(`/api/students?class=${encodeURIComponent(className!)}`)
      if (!res.ok) throw new Error('Failed to fetch students')
      return res.json() as Promise<StudentOption[]>
    },
    enabled: !!className,
    staleTime: FIVE_MIN,
  })
}
