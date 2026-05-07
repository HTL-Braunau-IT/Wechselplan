'use client'

import { useQuery } from '@tanstack/react-query'
import type { Student, GroupAssignment } from '@/types/schedule'
import { unwrapData } from '@/lib/api-client'

interface AssignmentsResponse {
	assignments: GroupAssignment[]
	unassignedStudents: Student[]
}

/**
 * Hook to fetch group assignments for a class and optional weekday (school year scoped).
 */
export function useGroupAssignments(
	classId: number | null,
	opts?: { weekday?: number; schoolYearId?: number }
) {
	const weekday = opts?.weekday ?? 1
	const schoolYearId = opts?.schoolYearId

	return useQuery<AssignmentsResponse>({
		queryKey: ['group-assignments', classId, weekday, schoolYearId ?? null],
		queryFn: async () => {
			if (!classId) throw new Error('Class ID is required')

			const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
			const response = await fetch(
				`/api/schedules/assignments?classId=${classId}&weekday=${weekday}${yearQ}`
			)
			if (!response.ok) {
				throw new Error('Failed to fetch group assignments')
			}
			const payload = await response.json()
			return unwrapData<AssignmentsResponse>(payload)
		},
		enabled: classId !== null,
		staleTime: 1000 * 60 * 5,
	})
}
