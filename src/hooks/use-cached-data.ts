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

async function fetchRooms(): Promise<{ rooms: Room[] }> {
	const response = await fetch('/api/rooms')
	if (!response.ok) throw new Error('Failed to fetch rooms')
	return response.json() as Promise<{ rooms: Room[] }>
}

async function fetchSubjects(): Promise<{ subjects: Subject[] }> {
	const response = await fetch('/api/subjects')
	if (!response.ok) throw new Error('Failed to fetch subjects')
	return response.json() as Promise<{ subjects: Subject[] }>
}

async function fetchLearningContents(): Promise<{ learningContents: LearningContent[] }> {
	const response = await fetch('/api/learning-contents')
	if (!response.ok) throw new Error('Failed to fetch learning contents')
	return response.json() as Promise<{ learningContents: LearningContent[] }>
}

async function fetchTeachers(): Promise<Teacher[]> {
	const response = await fetch('/api/teachers')
	if (!response.ok) throw new Error('Failed to fetch teachers')
	return response.json() as Promise<Teacher[]>
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
		rooms: roomsData?.rooms ?? [],
		subjects: subjectsData?.subjects ?? [],
		learningContents: learningContentsData?.learningContents ?? [],
		teachers: teachers ?? [],
		isLoading: isLoadingRooms || isLoadingSubjects || isLoadingLearningContents || isLoadingTeachers
	}
} 