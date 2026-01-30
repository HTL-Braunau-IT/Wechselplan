'use client'

import { useQuery } from '@tanstack/react-query'
import type { TeacherAssignmentsResponse } from '@/types/schedule'

/**
 * Hook to fetch teacher assignments for a class and weekday using React Query
 * 
 * @param classId - The class ID to fetch assignments for, or null to skip the query
 * @param weekday - The weekday to filter by (1-5), or null to skip the query
 * @returns React Query result with AM and PM teacher assignments
 */
export function useTeacherAssignments(classId: number | null, weekday: number | null = null) {
	return useQuery<TeacherAssignmentsResponse>({
		queryKey: ['teacher-assignments', classId, weekday],
		queryFn: async () => {
			if (!classId) throw new Error('Class ID is required')
			
			const url = weekday !== null
				? `/api/schedules/teacher-assignments?classId=${classId}&selectedWeekday=${weekday}`
				: `/api/schedules/teacher-assignments?classId=${classId}`
			
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Failed to fetch teacher assignments')
			}
			return response.json() as Promise<TeacherAssignmentsResponse>
		},
		enabled: classId !== null,
		staleTime: 1000 * 60 * 5, // 5 minutes
	})
}

