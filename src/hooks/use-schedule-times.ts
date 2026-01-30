'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ScheduleTime, BreakTime } from '@/types/schedule'

interface ScheduleTimesResponse {
	times: {
		scheduleTimes: ScheduleTime[]
		breakTimes: BreakTime[]
	}
}

interface SaveTimesRequest {
	scheduleTimes: { id: number }[]
	breakTimes: { id: number }[]
	classId: number
}

/**
 * Hook to fetch schedule times and break times for a class using React Query
 * 
 * @param classId - The class ID to fetch times for, or null to skip the query
 * @returns React Query result with schedule times and break times
 */
export function useScheduleTimes(classId: number | null) {
	return useQuery<ScheduleTimesResponse>({
		queryKey: ['schedule-times', classId],
		queryFn: async () => {
			if (!classId) throw new Error('Class ID is required')
			
			const response = await fetch(`/api/schedules/times?classId=${classId}`)
			if (!response.ok) {
				throw new Error('Failed to fetch schedule times')
			}
			return response.json() as Promise<ScheduleTimesResponse>
		},
		enabled: classId !== null,
		staleTime: 1000 * 60 * 5, // 5 minutes
	})
}

/**
 * Hook to save schedule times and break times using React Query mutation
 * 
 * @returns React Query mutation for saving schedule times
 */
export function useSaveScheduleTimes() {
	const queryClient = useQueryClient()
	
	return useMutation({
		mutationFn: async (data: SaveTimesRequest) => {
			const response = await fetch('/api/schedules/times', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data),
			})
			
			if (!response.ok) {
				throw new Error('Failed to save schedule times')
			}
			
			return response.json()
		},
		onSuccess: (_, variables) => {
			// Invalidate the schedule times query for this class
			queryClient.invalidateQueries({ queryKey: ['schedule-times', variables.classId] })
		},
	})
}

