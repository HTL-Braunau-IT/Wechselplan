'use client'

import { useQuery } from '@tanstack/react-query'
import type { Student, GroupAssignment } from '@/types/schedule'

interface AssignmentsResponse {
  assignments: GroupAssignment[]
  unassignedStudents: Student[]
  /** Set when the day had no grouping yet and this one was copied from that day. */
  seededFromWeekday?: number | null
}

/**
 * Hook to fetch one weekday's group assignments for a class using React Query.
 * Groups are per weekday (StudentWeekdayGroup), so the query waits for a weekday.
 *
 * @param classId - The class ID to fetch assignments for, or null to skip the query
 * @param weekday - The weekday plan whose groups to load, or null to skip the query
 * @param schoolYearId - The school year; the server falls back to the current one
 * @returns React Query result with assignments and unassigned students
 */
export function useGroupAssignments(
  classId: number | null,
  weekday: number | null,
  schoolYearId?: number,
) {
  return useQuery<AssignmentsResponse>({
    queryKey: ['group-assignments', classId, weekday, schoolYearId ?? null],
    queryFn: async () => {
      if (!classId || weekday == null) throw new Error('Class ID and weekday are required')

      const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
      const response = await fetch(
        `/api/schedules/assignments?classId=${classId}&weekday=${weekday}${yearQ}`,
      )
      if (!response.ok) {
        throw new Error('Failed to fetch group assignments')
      }
      return response.json() as Promise<AssignmentsResponse>
    },
    enabled: classId !== null && weekday != null,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
