'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ScheduleTime, BreakTime } from '@/types/schedule'
import { getApiErrorMessage, parseJsonSafe, unwrapData } from '@/lib/api-client'

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
	schoolYearId?: number
	weekday?: number
}

/**
 * Hook to fetch schedule times and break times for a class using React Query
 * 
 * @param classId - The class ID to fetch times for, or null to skip the query
 * @returns React Query result with schedule times and break times
 */
export function useScheduleTimes(classId: number | null, schoolYearId?: number, weekday?: number) {
	return useQuery<ScheduleTimesResponse>({
		queryKey: ['schedule-times', classId, schoolYearId ?? null, weekday ?? null],
		queryFn: async () => {
			if (!classId) throw new Error('Class ID is required')
			
			const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
			const wdQ = weekday != null && weekday >= 1 && weekday <= 5 ? `&weekday=${weekday}` : ''
			const response = await fetch(`/api/schedules/times?classId=${classId}${yearQ}${wdQ}`)
			const payload = await parseJsonSafe(response)
			if (!response.ok) {
				throw new Error(getApiErrorMessage(payload, 'Failed to fetch schedule times'))
			}
			return unwrapData<ScheduleTimesResponse>(payload)
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
		mutationFn: async (data: SaveTimesRequest): Promise<unknown> => {
			const response = await fetch('/api/schedules/times', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data),
			})
			const payload = await parseJsonSafe(response)
			
			if (!response.ok) {
				throw new Error(getApiErrorMessage(payload, 'Failed to save schedule times'))
			}
			
			return unwrapData<unknown>(payload)
		},
		onSuccess: (_, variables) => {
			void queryClient.invalidateQueries({ queryKey: ['schedule-times', variables.classId] })
		},
	})
}

