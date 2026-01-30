'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface TeacherRotation {
	classId: number
	groupId: number
	teacherId: number
	turnId: string
	period: 'AM' | 'PM'
}

interface TeacherRotationRequest {
	classId: number
	turns: string[]
	amRotation: {
		groupId: number
		turns: (number | null)[]
	}[]
	pmRotation: {
		groupId: number
		turns: (number | null)[]
	}[]
}

/**
 * Hook to save teacher rotation schedule using React Query mutation
 * 
 * Note: There's no GET endpoint for rotation data, so this hook only provides a mutation
 * for saving rotation data. The rotation data is typically managed locally in the component.
 * 
 * @returns React Query mutation for saving teacher rotation
 */
export function useScheduleRotationMutation() {
	const queryClient = useQueryClient()
	
	return useMutation({
		mutationFn: async (data: TeacherRotationRequest) => {
			const response = await fetch('/api/schedules/rotation', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data),
			})
			
			if (!response.ok) {
				throw new Error('Failed to save teacher rotation')
			}
			
			return response.json()
		},
		onSuccess: () => {
			// Invalidate related queries if needed
			queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] })
		},
	})
}

