'use client'

import { useQuery } from '@tanstack/react-query'
import type { Student, GroupAssignment } from '@/types/schedule'

interface AssignmentsResponse {
	assignments: GroupAssignment[]
	unassignedStudents: Student[]
}

/**
 * Hook to fetch group assignments for a class using React Query
 * 
 * @param classId - The class ID to fetch assignments for, or null to skip the query
 * @returns React Query result with assignments and unassigned students
 */
export function useGroupAssignments(classId: number | null) {
	return useQuery<AssignmentsResponse>({
		queryKey: ['group-assignments', classId],
		queryFn: async () => {
			if (!classId) throw new Error('Class ID is required')
			
			const response = await fetch(`/api/schedules/assignments?classId=${classId}`)
			if (!response.ok) {
				throw new Error('Failed to fetch group assignments')
			}
			return response.json() as Promise<AssignmentsResponse>
		},
		enabled: classId !== null,
		staleTime: 1000 * 60 * 5, // 5 minutes
	})
}

