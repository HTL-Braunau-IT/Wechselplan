import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useClassDataByName } from './use-class-data'

/**
 * Hook for managing schedule creation flow state and navigation
 * 
 * Provides:
 * - Class name to ID resolution
 * - Navigation helpers for schedule creation steps
 * - Common state management
 */
export function useScheduleCreation() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const className = searchParams.get('class')
	const weekdayParam = searchParams.get('weekday')
	
	const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
	const [selectedWeekday, setSelectedWeekday] = useState<number | null>(
		weekdayParam ? parseInt(weekdayParam) : null
	)

	// Resolve className to classId
	const { data: classData, isLoading: isLoadingClass } = useClassDataByName(className || null)
	
	useEffect(() => {
		if (classData) {
			setSelectedClassId(classData.id)
		} else if (!className) {
			setSelectedClassId(null)
		}
	}, [classData, className])

	// Navigation helpers
	const navigateToTeachers = () => {
		if (!className) return
		router.push(`/schedule/create/teachers?class=${className}`)
	}

	const navigateToRotation = (weekday?: number) => {
		if (!className) return
		const weekdayParam = weekday ?? selectedWeekday ?? 1
		router.push(`/schedule/create/rotation?class=${className}&weekday=${weekdayParam}`)
	}

	const navigateToTimes = (weekday?: number) => {
		if (!className) return
		const weekdayParam = weekday ?? selectedWeekday ?? 1
		router.push(`/schedule/create/times?class=${className}&weekday=${weekdayParam}`)
	}

	const navigateToOverview = () => {
		if (!className) return
		router.push(`/schedule/create/overview?class=${className}`)
	}

	const navigateBack = () => {
		router.back()
	}

	return {
		// State
		className,
		selectedClassId,
		selectedWeekday,
		setSelectedWeekday,
		isLoadingClass,
		
		// Navigation
		navigateToTeachers,
		navigateToRotation,
		navigateToTimes,
		navigateToOverview,
		navigateBack,
	}
}

