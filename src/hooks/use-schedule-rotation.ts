'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

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
		mutationFn: async (data: TeacherRotationRequest): Promise<unknown> => {
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
			
			return response.json() as Promise<unknown>
		},
		onSuccess: () => {
			// Invalidate related queries if needed
			void queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] })
		},
	})
}

