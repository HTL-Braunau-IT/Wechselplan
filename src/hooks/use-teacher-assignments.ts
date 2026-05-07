'use client'

import { useQuery } from '@tanstack/react-query'
import type { TeacherAssignmentsResponse } from '@/types/schedule'
import { unwrapData } from '@/lib/api-client'

/**
 * Hook to fetch teacher assignments for a class and weekday using React Query.
 */
export function useTeacherAssignments(
	classId: number | null,
	weekday: number | null = null,
	schoolYearId?: number
) {
	return useQuery<TeacherAssignmentsResponse>({
		queryKey: ['teacher-assignments', classId, weekday, schoolYearId ?? null],
		queryFn: async () => {
			if (!classId) throw new Error('Class ID is required')

			const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
			const url =
				weekday !== null
					? `/api/schedules/teacher-assignments?classId=${classId}&selectedWeekday=${weekday}${yearQ}`
					: `/api/schedules/teacher-assignments?classId=${classId}${yearQ}`

			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Failed to fetch teacher assignments')
			}
			const payload = await response.json()
			return unwrapData<TeacherAssignmentsResponse>(payload)
		},
		enabled: classId !== null,
		staleTime: 1000 * 60 * 5,
	})
}
