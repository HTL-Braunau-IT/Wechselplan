'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchAndUnwrap } from '@/lib/api-client'

interface Class {
	id: number
	name: string
	description: string | null
	classHead?: {
		firstName: string
		lastName: string
	} | null
	classLead?: {
		firstName: string
		lastName: string
	} | null
}

/**
 * Hook to fetch class data by ID using React Query
 * Note: This requires fetching all classes and finding by ID, as there's no direct endpoint
 * 
 * @param classId - The class ID to fetch, or null to skip the query
 * @returns React Query result with class data
 */
export function useClassData(classId: number | null) {
	return useQuery<Class | undefined>({
		queryKey: ['class', classId],
		queryFn: async () => {
			if (!classId) throw new Error('Class ID is required')
			
			const classes = await fetchAndUnwrap<Class[]>('/api/classes')
			return classes.find(c => c.id === classId)
		},
		enabled: classId !== null,
		staleTime: 1000 * 60 * 5, // 5 minutes
	})
}

/**
 * Hook to fetch class data by name using React Query
 * 
 * @param className - The class name to fetch, or null to skip the query
 * @returns React Query result with class data
 */
export function useClassDataByName(className: string | null) {
	return useQuery<Class>({
		queryKey: ['class', 'name', className],
		queryFn: async () => {
			if (!className) throw new Error('Class name is required')
			return fetchAndUnwrap<Class>(`/api/classes/get-by-name?name=${encodeURIComponent(className)}`)
		},
		enabled: className !== null && className !== '',
		staleTime: 1000 * 60 * 5, // 5 minutes
	})
}

