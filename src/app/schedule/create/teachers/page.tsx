'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'next-i18next'
import { Combobox } from '@headlessui/react'
import { useCachedData } from '@/hooks/use-cached-data'

interface Student {
	id: number
	firstName: string
	lastName: string
	class: string
}

interface Teacher {
	id: number
	firstName: string
	lastName: string
	subjects: string[]
}

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

interface Group {
	id: number
	students: Student[]
}

interface TeacherAssignment {
	groupId: number
	teacherId: number
	subjectId: number
	learningContentId: number
	roomId: number
}

interface GroupAssignment {
	groupId: number
	students: Student[]
}

interface AssignmentsResponse {
	assignments: GroupAssignment[]
}

interface TeacherAssignmentResponse {
	groupId: number
	teacherId: number
	subject: string
	learningContent: string
	room: string
}

interface TeacherAssignmentsResponse {
	amAssignments: TeacherAssignmentResponse[]
	pmAssignments: TeacherAssignmentResponse[]
}

interface ApiError {
	error: string
	message: string
}

function TeacherCombobox({ 
	value, 
	onChange, 
	teachers 
}: { 
	value: number | undefined, 
	onChange: (value: number) => void, 
	teachers: Teacher[] 
}) {
	const { t } = useTranslation('schedule')
	const [query, setQuery] = useState('')

	const filteredTeachers = query === ''
		? teachers
		: teachers.filter((teacher) =>
			`${teacher.lastName}, ${teacher.firstName}`
				.toLowerCase()
				.includes(query.toLowerCase())
		)

	return (
		<Combobox value={value ?? 0} onChange={onChange}>
			<div className="relative">
				<Combobox.Button className="w-full flex justify-between items-center border rounded px-2 py-1 text-left">
					<Combobox.Input
						className="w-full border-none focus:ring-0 p-0"
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
						displayValue={(teacherId: number) => {
							const teacher = teachers.find(t => t.id === teacherId)
							return teacher ? `${teacher.lastName}, ${teacher.firstName}` : ''
						}}
						placeholder={t('selectTeacher')}
					/>
					<svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
						<path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
					</svg>
				</Combobox.Button>
				<Combobox.Options className="fixed z-50 mt-1 max-h-[300px] w-[300px] overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
					{filteredTeachers.length === 0 && query !== '' ? (
						<div className="relative cursor-default select-none py-2 px-4 text-gray-700">
							{t('noTeachersFound')}
						</div>
					) : (
						filteredTeachers.map((teacher) => (
							<Combobox.Option
								key={teacher.id}
								value={teacher.id}
								className={({ active }: { active: boolean }) =>
									`relative cursor-default select-none py-2 pl-4 pr-4 ${
										active ? 'bg-blue-600 text-white' : 'text-gray-900'
									}`
								}
							>
								{teacher.lastName}, {teacher.firstName}
							</Combobox.Option>
						))
					)}
				</Combobox.Options>
			</div>
		</Combobox>
	)
}

function RoomCombobox({ 
	value, 
	onChange, 
	rooms 
}: { 
	value: number | undefined, 
	onChange: (value: number) => void, 
	rooms: Room[] 
}) {
	const { t } = useTranslation('schedule')
	const [query, setQuery] = useState('')

	const filteredRooms = query === ''
		? rooms
		: rooms.filter((room) =>
			room.name.toLowerCase().includes(query.toLowerCase())
		)

	return (
		<Combobox value={value ?? 0} onChange={onChange}>
			<div className="relative">
				<Combobox.Button className="w-full flex justify-between items-center border rounded px-2 py-1 text-left">
					<Combobox.Input
						className="w-full border-none focus:ring-0 p-0"
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
						displayValue={(roomId: number) => {
							const room = rooms.find(r => r.id === roomId)
							return room ? room.name : ''
						}}
						placeholder={t('selectRoom')}
					/>
					<svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
						<path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
					</svg>
				</Combobox.Button>
				<Combobox.Options className="fixed z-50 mt-1 max-h-[300px] w-[300px] overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
					{filteredRooms.length === 0 && query !== '' ? (
						<div className="relative cursor-default select-none py-2 px-4 text-gray-700">
							{t('noRoomsFound')}
						</div>
					) : (
						filteredRooms.map((room) => (
							<Combobox.Option
								key={room.id}
								value={room.id}
								className={({ active }: { active: boolean }) =>
									`relative cursor-default select-none py-2 pl-4 pr-4 ${
										active ? 'bg-blue-600 text-white' : 'text-gray-900'
									}`
								}
							>
								{room.name}
							</Combobox.Option>
						))
					)}
				</Combobox.Options>
			</div>
		</Combobox>
	)
}

function SubjectCombobox({ 
	value, 
	onChange, 
	subjects 
}: { 
	value: number | undefined, 
	onChange: (value: number) => void, 
	subjects: Subject[] 
}) {
	const { t } = useTranslation('schedule')
	const [query, setQuery] = useState('')

	const filteredSubjects = query === ''
		? subjects
		: subjects.filter((subject) =>
			subject.name.toLowerCase().includes(query.toLowerCase())
		)

	return (
		<Combobox value={value ?? 0} onChange={onChange}>
			<div className="relative">
				<Combobox.Button className="w-full flex justify-between items-center border rounded px-2 py-1 text-left">
					<Combobox.Input
						className="w-full border-none focus:ring-0 p-0"
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
						displayValue={(subjectId: number) => {
							const subject = subjects.find(s => s.id === subjectId)
							return subject ? subject.name : ''
						}}
						placeholder={t('selectSubject')}
					/>
					<svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
						<path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
					</svg>
				</Combobox.Button>
				<Combobox.Options className="fixed z-50 mt-1 max-h-[300px] w-[300px] overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
					{filteredSubjects.length === 0 && query !== '' ? (
						<div className="relative cursor-default select-none py-2 px-4 text-gray-700">
							{t('noSubjectsFound')}
						</div>
					) : (
						filteredSubjects.map((subject) => (
							<Combobox.Option
								key={subject.id}
								value={subject.id}
								className={({ active }: { active: boolean }) =>
									`relative cursor-default select-none py-2 pl-4 pr-4 ${
										active ? 'bg-blue-600 text-white' : 'text-gray-900'
									}`
								}
							>
								{subject.name}
							</Combobox.Option>
						))
					)}
				</Combobox.Options>
			</div>
		</Combobox>
	)
}

function LearningContentCombobox({ 
	value, 
	onChange, 
	learningContents 
}: { 
	value: number | undefined, 
	onChange: (value: number) => void, 
	learningContents: LearningContent[] 
}) {
	const { t } = useTranslation('schedule')
	const [query, setQuery] = useState('')

	const filteredLearningContents = query === ''
		? learningContents
		: learningContents.filter((content) =>
			content.name.toLowerCase().includes(query.toLowerCase())
		)

	return (
		<Combobox value={value ?? 0} onChange={onChange}>
			<div className="relative">
				<Combobox.Button className="w-full flex justify-between items-center border rounded px-2 py-1 text-left">
					<Combobox.Input
						className="w-full border-none focus:ring-0 p-0"
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
						displayValue={(contentId: number) => {
							const content = learningContents.find(c => c.id === contentId)
							return content ? content.name : ''
						}}
						placeholder={t('selectLearningContent')}
					/>
					<svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
						<path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
					</svg>
				</Combobox.Button>
				<Combobox.Options className="fixed z-50 mt-1 max-h-[300px] w-[300px] overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
					{filteredLearningContents.length === 0 && query !== '' ? (
						<div className="relative cursor-default select-none py-2 px-4 text-gray-700">
							{t('noLearningContentsFound')}
						</div>
					) : (
						filteredLearningContents.map((content) => (
							<Combobox.Option
								key={content.id}
								value={content.id}
								className={({ active }: { active: boolean }) =>
									`relative cursor-default select-none py-2 pl-4 pr-4 ${
										active ? 'bg-blue-600 text-white' : 'text-gray-900'
									}`
								}
							>
								{content.name}
							</Combobox.Option>
						))
					)}
				</Combobox.Options>
			</div>
		</Combobox>
	)
}

export default function TeacherAssignmentPage() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const { t } = useTranslation('schedule')
	const selectedClass = searchParams.get('class')

	const { rooms, subjects, learningContents, teachers, isLoading: isLoadingCachedData } = useCachedData()
	const [groups, setGroups] = useState<Group[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [amAssignments, setAmAssignments] = useState<TeacherAssignment[]>([])
	const [pmAssignments, setPmAssignments] = useState<TeacherAssignment[]>([])
	const [showConfirmDialog, setShowConfirmDialog] = useState(false)
	const [showErrorDialog, setShowErrorDialog] = useState(false)
	const [validationErrors, setValidationErrors] = useState<{
		am: { groupId: number; missingFields: string[] }[]
		pm: { groupId: number; missingFields: string[] }[]
	}>({ am: [], pm: [] })
	const [pendingAssignments, setPendingAssignments] = useState<{
		amAssignments: TeacherAssignment[]
		pmAssignments: TeacherAssignment[]
	} | null>(null)
	const [hasExistingAssignments, setHasExistingAssignments] = useState(false)

	// Add effect to ensure assignments are initialized for all groups
	useEffect(() => {
		// Create initial assignments for any new groups
		const initializeAssignments = (currentAssignments: TeacherAssignment[]) => {
			const existingGroupIds = new Set(currentAssignments.map(a => a.groupId))
			const newAssignments = groups
				.filter(group => !existingGroupIds.has(group.id))
				.map(group => ({
					groupId: group.id,
					teacherId: 0,
					subjectId: 0,
					learningContentId: 0,
					roomId: 0
				}))
			return [...currentAssignments, ...newAssignments]
		}

		setAmAssignments(current => initializeAssignments(current))
		setPmAssignments(current => initializeAssignments(current))
	}, [groups])

	useEffect(() => {
		async function fetchData() {
			if (!selectedClass) return

			setLoading(true)
			try {
				// Fetch groups
				const groupsRes = await fetch(`/api/schedule/assignments?class=${selectedClass}`)
				if (!groupsRes.ok) throw new Error('Failed to fetch groups')
				const groupsData = await groupsRes.json() as AssignmentsResponse
				setGroups(groupsData.assignments.map(assignment => ({
					id: assignment.groupId,
					students: assignment.students
				})))

				// Fetch existing teacher assignments
				const teacherAssignmentsRes = await fetch(`/api/schedule/teacher-assignments?class=${selectedClass}`)
				if (teacherAssignmentsRes.ok) {
					const teacherAssignmentsData = await teacherAssignmentsRes.json() as TeacherAssignmentsResponse
					const hasExistingAmAssignments = teacherAssignmentsData.amAssignments.some(a => a.teacherId !== 0)
					const hasExistingPmAssignments = teacherAssignmentsData.pmAssignments.some(a => a.teacherId !== 0)
					
					// Initialize base assignments for all groups
					const initialAssignments: TeacherAssignment[] = groupsData.assignments.map(assignment => ({
						groupId: assignment.groupId,
						teacherId: 0,
						subjectId: 0,
						learningContentId: 0,
						roomId: 0
					}))

					// Map string values back to IDs
					const mapAssignmentsToIds = (assignments: TeacherAssignmentResponse[]) => assignments.map(assignment => {
						const subject = subjects.find(s => s.name === assignment.subject)
						const learningContent = learningContents.find(lc => lc.name === assignment.learningContent)
						const room = rooms.find(r => r.name === assignment.room)

						return {
							groupId: assignment.groupId,
							teacherId: assignment.teacherId,
							subjectId: subject?.id ?? 0,
							learningContentId: learningContent?.id ?? 0,
							roomId: room?.id ?? 0
						}
					})

					// Set AM assignments
					if (hasExistingAmAssignments) {
						setAmAssignments(mapAssignmentsToIds(teacherAssignmentsData.amAssignments))
					} else {
						setAmAssignments(initialAssignments)
					}

					// Set PM assignments
					if (hasExistingPmAssignments) {
						setPmAssignments(mapAssignmentsToIds(teacherAssignmentsData.pmAssignments))
					} else {
						setPmAssignments(initialAssignments)
					}

					// Only show warning if either AM or PM has existing assignments
					setHasExistingAssignments(hasExistingAmAssignments || hasExistingPmAssignments)
				} else {
					// Initialize empty assignments if none exist
					const initialAssignments: TeacherAssignment[] = groupsData.assignments.map(assignment => ({
						groupId: assignment.groupId,
						teacherId: 0,
						subjectId: 0,
						learningContentId: 0,
						roomId: 0
					}))
					setAmAssignments(initialAssignments)
					setPmAssignments(initialAssignments)
					setHasExistingAssignments(false)
				}
			} catch (error) {
				console.error('Error:', error)
				setError('Fehler beim Laden der Daten.')
			} finally {
				setLoading(false)
			}
		}
		void fetchData()
	}, [selectedClass])

	function handleAssignmentChange(
		period: 'am' | 'pm',
		groupId: number,
		field: keyof TeacherAssignment,
		value: string | number
	) {
		const setAssignments = period === 'am' ? setAmAssignments : setPmAssignments
		setAssignments(current => {
			const existingAssignment = current.find(a => a.groupId === groupId)
			if (existingAssignment) {
				return current.map(assignment => 
					assignment.groupId === groupId
						? { ...assignment, [field]: value }
						: assignment
				)
			} else {
				// Create new assignment with all fields initialized to 0
				const newAssignment: TeacherAssignment = {
					groupId,
					teacherId: 0,
					subjectId: 0,
					learningContentId: 0,
					roomId: 0,
					[field]: value // Set the changed field
				}
				return [...current, newAssignment]
			}
		})
	}

	async function handleNext() {
		try {
			// Keep all assignments that have any field filled in
			const validAmAssignments = amAssignments.filter(a => 
				a.teacherId !== 0 || 
				a.subjectId !== 0 || 
				a.learningContentId !== 0 || 
				a.roomId !== 0
			)
			const validPmAssignments = pmAssignments.filter(a => 
				a.teacherId !== 0 || 
				a.subjectId !== 0 || 
				a.learningContentId !== 0 || 
				a.roomId !== 0
			)

			// Check if any group in AM has assignments
			const hasAnyAmAssignments = validAmAssignments.length > 0
			// Check if any group in PM has assignments
			const hasAnyPmAssignments = validPmAssignments.length > 0

			// Initialize validation errors
			const newValidationErrors: {
				am: { groupId: number; missingFields: string[] }[]
				pm: { groupId: number; missingFields: string[] }[]
			} = { am: [], pm: [] }

			// Check AM assignments
			if (hasAnyAmAssignments) {
				groups.forEach(group => {
					const assignment = validAmAssignments.find(a => a.groupId === group.id)
					if (!assignment) {
						newValidationErrors.am.push({ groupId: group.id, missingFields: ['teacher'] })
					} else {
						const missingFields: string[] = []
						if (!assignment.subjectId) missingFields.push('subject')
						if (!assignment.learningContentId) missingFields.push('learningContent')
						if (!assignment.roomId) missingFields.push('room')
						if (missingFields.length > 0) {
							newValidationErrors.am.push({ groupId: group.id, missingFields })
						}
					}
				})
			}

			// Check PM assignments
			if (hasAnyPmAssignments) {
				groups.forEach(group => {
					const assignment = validPmAssignments.find(a => a.groupId === group.id)
					if (!assignment) {
						newValidationErrors.pm.push({ groupId: group.id, missingFields: ['teacher'] })
					} else {
						const missingFields: string[] = []
						if (!assignment.subjectId) missingFields.push('subject')
						if (!assignment.learningContentId) missingFields.push('learningContent')
						if (!assignment.roomId) missingFields.push('room')
						if (missingFields.length > 0) {
							newValidationErrors.pm.push({ groupId: group.id, missingFields })
						}
					}
				})
			}

			// If there are validation errors, show them
			if (newValidationErrors.am.length > 0 || newValidationErrors.pm.length > 0) {
				setValidationErrors(newValidationErrors)
				setShowErrorDialog(true)
				return
			}

			// Map the assignments to include string values for subject, learningContent, and room
			const mapAssignments = (assignments: TeacherAssignment[]) => assignments.map(assignment => {
				const subject = subjects.find(s => s.id === assignment.subjectId)
				const learningContent = learningContents.find(lc => lc.id === assignment.learningContentId)
				const room = rooms.find(r => r.id === assignment.roomId)

				return {
					groupId: assignment.groupId,
					teacherId: assignment.teacherId,
					subject: subject?.name ?? '',
					learningContent: learningContent?.name ?? '',
					room: room?.name ?? ''
				}
			})

			// If no changes or no existing assignments, proceed with saving
			const response = await fetch('/api/schedule/teacher-assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					class: selectedClass,
					amAssignments: mapAssignments(validAmAssignments),
					pmAssignments: mapAssignments(validPmAssignments)
				}),
			})

			if (!response.ok) {
				const errorData = await response.json() as ApiError
				if (response.status === 409 && errorData.error === 'EXISTING_ASSIGNMENTS') {
					setPendingAssignments({
						amAssignments: validAmAssignments,
						pmAssignments: validPmAssignments
					})
					setShowConfirmDialog(true)
					return
				}
				throw new Error(errorData.message ?? 'Failed to save teacher assignments')
			}

			router.push(`/schedule/create/rotation?class=${selectedClass}`)
		} catch (error) {
			console.error('Error:', error)
			setError(error instanceof Error ? error.message : 'Fehler beim Speichern der Lehrerzuweisungen.')
		}
	}

	async function handleConfirmUpdate() {
		if (!pendingAssignments) return

		try {
			// Map the assignments to include string values for subject, learningContent, and room
			const mapAssignments = (assignments: TeacherAssignment[]) => assignments.map(assignment => {
				const subject = subjects.find(s => s.id === assignment.subjectId)
				const learningContent = learningContents.find(lc => lc.id === assignment.learningContentId)
				const room = rooms.find(r => r.id === assignment.roomId)

				return {
					groupId: assignment.groupId,
					teacherId: assignment.teacherId,
					subject: subject?.name ?? '',
					learningContent: learningContent?.name ?? '',
					room: room?.name ?? ''
				}
			})

			const response = await fetch('/api/schedule/teacher-assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					class: selectedClass,
					amAssignments: mapAssignments(pendingAssignments.amAssignments),
					pmAssignments: mapAssignments(pendingAssignments.pmAssignments),
					updateExisting: true
				}),
			})

			if (!response.ok) {
				throw new Error('Failed to update teacher assignments')
			}

			setShowConfirmDialog(false)
			setPendingAssignments(null)
			router.push(`/schedule/create/rotation?class=${selectedClass}`)
		} catch (error) {
			console.error('Error:', error)
			setError(error instanceof Error ? error.message : 'Fehler beim Aktualisieren der Lehrerzuweisungen.')
		}
	}

	function handleCancelUpdate() {
		setShowConfirmDialog(false)
		setPendingAssignments(null)
	}

	if (isLoadingCachedData || loading) return <div className="p-4">{t('loading')}</div>
	if (error) return <div className="p-4 text-red-500">{error}</div>
	if (!selectedClass) return <div className="p-4">{t('noClassSelected')}</div>

	return (
		<div className="min-h-screen bg-background p-4">
			<div className="max-w-7xl mx-auto">
				<h1 className="text-2xl font-bold mb-6 text-foreground">
					{t('teacherAssignment')} - {selectedClass}
				</h1>

				{hasExistingAssignments && (
					<div className="mb-4 p-4 bg-muted text-muted-foreground rounded-lg">
						{t('existingAssignmentsWarning')}
					</div>
				)}

				<div className="space-y-8">
					{/* AM Assignments */}
					<div>
						<h2 className="text-xl font-semibold mb-4 text-foreground">{t('morningAssignments')}</h2>
						<div className="bg-card rounded-lg shadow">
							<table className="min-w-full divide-y divide-border">
								<thead className="bg-muted">
									<tr>
										<th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
											{t('group')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
											{t('teacher')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
											{t('subject')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
											{t('learningContent')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
											{t('room')}
										</th>
									</tr>
								</thead>
								<tbody className="bg-card divide-y divide-border">
									{groups.map((group) => {
										const assignment = amAssignments.find(a => a.groupId === group.id)
										return (
											<tr key={group.id}>
												<td className="px-6 py-4 whitespace-nowrap">
													{t('group')} {group.id}
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<TeacherCombobox
														value={assignment?.teacherId ?? 0}
														onChange={(value) => handleAssignmentChange('am', group.id, 'teacherId', value)}
														teachers={teachers}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<SubjectCombobox
														value={assignment?.subjectId ?? 0}
														onChange={(value) => handleAssignmentChange('am', group.id, 'subjectId', value)}
														subjects={subjects}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<LearningContentCombobox
														value={assignment?.learningContentId ?? 0}
														onChange={(value) => handleAssignmentChange('am', group.id, 'learningContentId', value)}
														learningContents={learningContents}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<RoomCombobox
														value={assignment?.roomId ?? 0}
														onChange={(value) => handleAssignmentChange('am', group.id, 'roomId', value)}
														rooms={rooms}
													/>
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</div>

					{/* PM Assignments */}
					<div>
						<h2 className="text-xl font-semibold mb-4 text-foreground">{t('afternoonAssignments')}</h2>
						<div className="bg-card rounded-lg shadow">
							<table className="min-w-full divide-y divide-border">
								<thead className="bg-muted">
									<tr>
										<th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
											{t('group')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
											{t('teacher')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
											{t('subject')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
											{t('learningContent')}
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
											{t('room')}
										</th>
									</tr>
								</thead>
								<tbody className="bg-card divide-y divide-border">
									{groups.map((group) => {
										const assignment = pmAssignments.find(a => a.groupId === group.id)
										return (
											<tr key={group.id}>
												<td className="px-6 py-4 whitespace-nowrap">
													{t('group')} {group.id}
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<TeacherCombobox
														value={assignment?.teacherId ?? 0}
														onChange={(value) => handleAssignmentChange('pm', group.id, 'teacherId', value)}
														teachers={teachers}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<SubjectCombobox
														value={assignment?.subjectId ?? 0}
														onChange={(value) => handleAssignmentChange('pm', group.id, 'subjectId', value)}
														subjects={subjects}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<LearningContentCombobox
														value={assignment?.learningContentId ?? 0}
														onChange={(value) => handleAssignmentChange('pm', group.id, 'learningContentId', value)}
														learningContents={learningContents}
													/>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<RoomCombobox
														value={assignment?.roomId ?? 0}
														onChange={(value) => handleAssignmentChange('pm', group.id, 'roomId', value)}
														rooms={rooms}
													/>
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</div>
					</div>

					<div className="mt-6 flex justify-end">
						<button
							onClick={handleNext}
							className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
						>
							{t('next')}
						</button>
					</div>
				</div>
			</div>

			{/* Confirmation Dialog */}
			{showConfirmDialog && (
				<div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center">
					<div className="bg-card p-6 rounded-lg max-w-md shadow-xl">
						<h2 className="text-xl font-bold mb-4 text-foreground">{t('updateAssignmentsTitle')}</h2>
						<p className="mb-6 text-foreground">{t('updateAssignmentsMessage')}</p>
						<div className="flex justify-end space-x-4">
							<button
								onClick={handleCancelUpdate}
								className="px-4 py-2 text-muted-foreground hover:text-foreground"
							>
								{t('cancel')}
							</button>
							<button
								onClick={handleConfirmUpdate}
								className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
							>
								{t('update')}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Error Dialog */}
			{showErrorDialog && (
				<div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center">
					<div className="bg-card p-6 rounded-lg max-w-2xl shadow-xl">
						<h2 className="text-xl font-bold mb-4 text-foreground">{t('validationErrorsTitle')}</h2>
						<div className="mb-6 space-y-4">
							{validationErrors.am.length > 0 && (
								<div>
									<h3 className="font-semibold mb-2 text-foreground">{t('morningAssignments')}</h3>
									<ul className="list-disc pl-5 space-y-1 text-foreground">
										{validationErrors.am.map(error => (
											<li key={error.groupId}>
												{t('group')} {error.groupId}: {error.missingFields.map(field => t(field)).join(', ')}
											</li>
										))}
									</ul>
								</div>
							)}
							{validationErrors.pm.length > 0 && (
								<div>
									<h3 className="font-semibold mb-2 text-foreground">{t('afternoonAssignments')}</h3>
									<ul className="list-disc pl-5 space-y-1 text-foreground">
										{validationErrors.pm.map(error => (
											<li key={error.groupId}>
												{t('group')} {error.groupId}: {error.missingFields.map(field => t(field)).join(', ')}
											</li>
										))}
									</ul>
								</div>
							)}
						</div>
						<div className="flex justify-end">
							<button
								onClick={() => setShowErrorDialog(false)}
								className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
							>
								{t('ok')}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
} 