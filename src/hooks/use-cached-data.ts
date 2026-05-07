import { useQuery } from '@tanstack/react-query'

interface Room {
	id: number
	name: string
}

interface Subject {
	id: number
	name: string
}

interface LearningContent {
	id: number
	name: string
}

interface Teacher {
	id: number
	firstName: string
	lastName: string
}

async function fetchRooms(): Promise<Room[]> {
	const response = await fetch('/api/rooms')
	if (!response.ok) throw new Error('Failed to fetch rooms')
	const payload = await response.json() as { data?: Room[] } | Room[]
	return Array.isArray(payload) ? payload : (payload.data ?? [])
}

async function fetchSubjects(): Promise<Subject[]> {
	const response = await fetch('/api/subjects')
	if (!response.ok) throw new Error('Failed to fetch subjects')
	const payload = await response.json() as { data?: Subject[] } | Subject[]
	return Array.isArray(payload) ? payload : (payload.data ?? [])
}

async function fetchLearningContents(): Promise<LearningContent[]> {
	const response = await fetch('/api/learning-contents')
	if (!response.ok) throw new Error('Failed to fetch learning contents')
	const payload = await response.json() as { data?: LearningContent[] } | LearningContent[]
	return Array.isArray(payload) ? payload : (payload.data ?? [])
}

async function fetchTeachers(): Promise<Teacher[]> {
	const response = await fetch('/api/teachers')
	if (!response.ok) throw new Error('Failed to fetch teachers')
	const payload = await response.json() as { data?: Teacher[] } | Teacher[]
	return Array.isArray(payload) ? payload : (payload.data ?? [])
}

export function useCachedData() {
	const { data: roomsData, isLoading: isLoadingRooms } = useQuery({
		queryKey: ['rooms'],
		queryFn: fetchRooms,
		staleTime: 0,
		gcTime: 0,
	})

	const { data: subjectsData, isLoading: isLoadingSubjects } = useQuery({
		queryKey: ['subjects'],
		queryFn: fetchSubjects,
		staleTime: 0,
		gcTime: 0,
	})

	const { data: learningContentsData, isLoading: isLoadingLearningContents } = useQuery({
		queryKey: ['learningContents'],
		queryFn: fetchLearningContents,
		staleTime: 0,
		gcTime: 0,
	})

	const { data: teachers, isLoading: isLoadingTeachers } = useQuery({
		queryKey: ['teachers'],
		queryFn: fetchTeachers,
		staleTime: 0,
		gcTime: 0,
	})

	return {
		rooms: roomsData ?? [],
		subjects: subjectsData ?? [],
		learningContents: learningContentsData ?? [],
		teachers: teachers ?? [],
		isLoading: isLoadingRooms || isLoadingSubjects || isLoadingLearningContents || isLoadingTeachers
	}
} 