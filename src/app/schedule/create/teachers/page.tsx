'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'next-i18next'
import { useQuery } from '@tanstack/react-query'
import { useCachedData } from '@/hooks/use-cached-data'
import { useClassDataByName } from '@/hooks/use-class-data'
import { useGroupAssignments } from '@/hooks/use-group-assignments'
import { useTeacherAssignments } from '@/hooks/use-teacher-assignments'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { captureFrontendError } from '@/lib/frontend-error'
import { TeacherSelect } from '@/components/schedule/teacher-select'
import { SubjectSelect } from '@/components/schedule/subject-select'
import { LearningContentSelect } from '@/components/schedule/learning-content-select'
import { RoomSelect } from '@/components/schedule/room-select'

interface Student {
	id: number
	firstName: string
	lastName: string
	class: string
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
	// Custom values for when user enters their own text
	customSubject?: string
	customLearningContent?: string
	customRoom?: string
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
	selectedWeekday?: number
}

interface ApiError {
	error: string
	message: string
}

const WEEKDAYS = [
	{ value: 1, label: 'Monday' },
	{ value: 2, label: 'Tuesday' },
	{ value: 3, label: 'Wednesday' },
	{ value: 4, label: 'Thursday' },
	{ value: 5, label: 'Friday' }
]

/**
 * React component for assigning teachers, subjects, learning contents, and rooms to student groups for a selected class and weekday.
 *
 * Displays and manages AM and PM teacher assignments for each group, supports weekday selection, validates input, handles conflicts with existing assignments, and persists changes. Provides UI feedback for loading, errors, and confirmation dialogs.
 *
 * @remark Navigates to the rotation creation page upon successful assignment save or update, including the selected class and weekday in the query parameters.
 */
export default function TeacherAssignmentPage() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const { t } = useTranslation('schedule')
	const selectedClass = searchParams.get('class')
	const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
	const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null)

	const { rooms, subjects, learningContents, teachers, isLoading: isLoadingCachedData } = useCachedData()
	const [groups, setGroups] = useState<Group[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [amAssignments, setAmAssignments] = useState<TeacherAssignment[]>([])
	const [pmAssignments, setPmAssignments] = useState<TeacherAssignment[]>([])
	
	// Helper function to get display value for subject, learning content, or room
	const getDisplayValue = (assignment: TeacherAssignment, field: 'subject' | 'learningContent' | 'room') => {
		if (field === 'subject') {
			return assignment.customSubject ?? subjects.find(s => s.id === assignment.subjectId)?.name ?? ''
		} else if (field === 'learningContent') {
			return assignment.customLearningContent ?? learningContents.find(lc => lc.id === assignment.learningContentId)?.name ?? ''
		} else if (field === 'room') {
			return assignment.customRoom ?? rooms.find(r => r.id === assignment.roomId)?.name ?? ''
		}
		return ''
	}
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

	// Resolve className to classId when selectedClass changes
	const { data: classData } = useClassDataByName(selectedClass || null)
	
	useEffect(() => {
		if (classData) {
			setSelectedClassId(classData.id)
		} else if (!selectedClass) {
			setSelectedClassId(null)
		}
	}, [classData, selectedClass])

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
			if (!selectedClass || !selectedClassId || isLoadingCachedData) return

			setLoading(true)
			try {
				// Fetch groups
				const groupsRes = await fetch(`/api/schedules/assignments?classId=${selectedClassId}`)
				if (!groupsRes.ok) throw new Error('Failed to fetch groups')
				const groupsData = await groupsRes.json() as AssignmentsResponse
				setGroups(groupsData.assignments.map(assignment => ({
					id: assignment.groupId,
					students: assignment.students
				})))

				// Fetch existing teacher assignments
				const teacherAssignmentsRes = await fetch(`/api/schedules/teacher-assignments?classId=${selectedClassId}`)
				if (teacherAssignmentsRes.ok) {
					const teacherAssignmentsData = await teacherAssignmentsRes.json() as TeacherAssignmentsResponse
					const hasExistingAmAssignments = teacherAssignmentsData.amAssignments.some(a => a.teacherId !== 0)
					const hasExistingPmAssignments = teacherAssignmentsData.pmAssignments.some(a => a.teacherId !== 0)
					
					// Set the weekday from the response
					setSelectedWeekday(teacherAssignmentsData.selectedWeekday ?? 1)
					
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

						if (!subject || !learningContent || !room) {
							console.warn('Missing cached data for assignment mapping:', {
								subject: assignment.subject,
								learningContent: assignment.learningContent,
								room: assignment.room
							})
						}

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
					setHasExistingAssignments(hasExistingAmAssignments ?? hasExistingPmAssignments)
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
			} catch (err) {
				console.error('Error fetching data:', err)
				captureFrontendError(err, {
					location: 'schedule/create/teachers',
					type: 'fetch-data',
					extra: {
						selectedClass
					}
				})
				setError('Failed to load data. Please try again.')
			} finally {
				setLoading(false)
			}
		}
		void fetchData()
	}, [selectedClass, selectedClassId, isLoadingCachedData, subjects, learningContents, rooms])

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

	function handleStringFieldChange(
		period: 'am' | 'pm',
		groupId: number,
		field: 'subject' | 'learningContent' | 'room',
		value: string
	) {
		const setAssignments = period === 'am' ? setAmAssignments : setPmAssignments
		setAssignments(current => {
			const existingAssignment = current.find(a => a.groupId === groupId)
			
			// Find the ID for the selected value if it exists in the options
			let idField: keyof TeacherAssignment
			let customField: keyof TeacherAssignment
			let options: { id: number; name: string }[]
			
			if (field === 'subject') {
				idField = 'subjectId'
				customField = 'customSubject'
				options = subjects
			} else if (field === 'learningContent') {
				idField = 'learningContentId'
				customField = 'customLearningContent'
				options = learningContents
			} else {
				idField = 'roomId'
				customField = 'customRoom'
				options = rooms
			}
			
			const selectedOption = options.find(option => option.name === value)
			
			if (existingAssignment) {
				return current.map(assignment => 
					assignment.groupId === groupId
						? { 
							...assignment, 
							[idField]: selectedOption?.id ?? 0,
							[customField]: selectedOption ? undefined : value
						}
						: assignment
				)
			} else {
				// Create new assignment
				const newAssignment: TeacherAssignment = {
					groupId,
					teacherId: 0,
					subjectId: 0,
					learningContentId: 0,
					roomId: 0,
					[idField]: selectedOption?.id ?? 0,
					[customField]: selectedOption ? undefined : value
				}
				return [...current, newAssignment]
			}
		})
	}

	function handleClearRow(period: 'am' | 'pm', groupId: number) {
		const setAssignments = period === 'am' ? setAmAssignments : setPmAssignments
		setAssignments(current => {
			return current.map(assignment => 
				assignment.groupId === groupId
					? {
						...assignment,
						teacherId: 0,
						subjectId: 0,
						learningContentId: 0,
						roomId: 0,
						customSubject: undefined,
						customLearningContent: undefined,
						customRoom: undefined
					}
					: assignment
			)
		})
	}

	async function handleNext() {
		try {
			// Keep all assignments that have any field filled in
			const validAmAssignments = amAssignments.filter(a => 
				a.teacherId !== 0 || 
				a.subjectId !== 0 || 
				a.learningContentId !== 0 || 
				a.roomId !== 0 ||
				(a.customSubject ??
				a.customLearningContent ??
				a.customRoom)
			)
			const validPmAssignments = pmAssignments.filter(a => 
				a.teacherId !== 0 || 
				a.subjectId !== 0 || 
				a.learningContentId !== 0 || 
				a.roomId !== 0 ||
				(a.customSubject ??
				a.customLearningContent ??
				a.customRoom)
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
						const hasSubject = assignment.subjectId !== 0 || assignment.customSubject
						const hasLearningContent = assignment.learningContentId !== 0 || assignment.customLearningContent
						const hasRoom = assignment.roomId !== 0 || assignment.customRoom
						
						if (!hasSubject) missingFields.push('subject')
						if (!hasLearningContent) missingFields.push('learningContent')
						if (!hasRoom) missingFields.push('room')
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
						const hasSubject = assignment.subjectId !== 0 || assignment.customSubject
						const hasLearningContent = assignment.learningContentId !== 0 || assignment.customLearningContent
						const hasRoom = assignment.roomId !== 0 || assignment.customRoom
						
						if (!hasSubject) missingFields.push('subject')
						if (!hasLearningContent) missingFields.push('learningContent')
						if (!hasRoom) missingFields.push('room')
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
				const subject = assignment.customSubject ?? subjects.find(s => s.id === assignment.subjectId)?.name ?? ''
				const learningContent = assignment.customLearningContent ?? learningContents.find(lc => lc.id === assignment.learningContentId)?.name ?? ''
				const room = assignment.customRoom ?? rooms.find(r => r.id === assignment.roomId)?.name ?? ''

				return {
					groupId: assignment.groupId,
					teacherId: assignment.teacherId,
					subject,
					learningContent,
					room
				}
			})

			// If no changes or no existing assignments, proceed with saving
			if (!selectedClassId) throw new Error('Class ID not available')
			const response = await fetch('/api/schedules/teacher-assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					classId: selectedClassId,
					amAssignments: mapAssignments(validAmAssignments),
					pmAssignments: mapAssignments(validPmAssignments),
					updateExisting: true,
					selectedWeekday: selectedWeekday ?? 1
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

			// Navigate to the rotation page with both class and weekday parameters
			router.push(`/schedule/create/rotation?class=${selectedClass}&weekday=${selectedWeekday ?? 1}`)
		} catch (err) {
			console.error('Error saving assignments:', err)
			captureFrontendError(err, {
				location: 'schedule/create/teachers',
				type: 'save-assignments',
				extra: {
					selectedClass,
					assignments: {
						am: amAssignments,
						pm: pmAssignments
					}
				}
			})
			setError('Failed to save assignments. Please try again.')
		}
	}

	async function handleConfirmUpdate() {
		if (!pendingAssignments || !selectedClassId) return

		try {
			// Map the assignments to include string values for subject, learningContent, and room
			const mapAssignments = (assignments: TeacherAssignment[]) => assignments.map(assignment => {
				const subject = assignment.customSubject ?? subjects.find(s => s.id === assignment.subjectId)?.name ?? ''
				const learningContent = assignment.customLearningContent ?? learningContents.find(lc => lc.id === assignment.learningContentId)?.name ?? ''
				const room = assignment.customRoom ?? rooms.find(r => r.id === assignment.roomId)?.name ?? ''

				return {
					groupId: assignment.groupId,
					teacherId: assignment.teacherId,
					subject,
					learningContent,
					room
				}
			})

			const response = await fetch('/api/schedules/teacher-assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					classId: selectedClassId,
					amAssignments: mapAssignments(pendingAssignments.amAssignments),
					pmAssignments: mapAssignments(pendingAssignments.pmAssignments),
					updateExisting: true,
					selectedWeekday: selectedWeekday ?? 1
				}),
			})

			if (!response.ok) {
				throw new Error('Failed to update teacher assignments')
			}

			setShowConfirmDialog(false)
			setPendingAssignments(null)
			router.push(`/schedule/create/rotation?class=${selectedClass}&weekday=${selectedWeekday ?? 1}`)
		} catch (err) {
			console.error('Error updating assignments:', err)
			captureFrontendError(err, {
				location: 'schedule/create/teachers',
				type: 'update-assignments',
				extra: {
					selectedClass,
					assignments: {
						am: amAssignments,
						pm: pmAssignments
					}
				}
			})
			setError('Failed to update assignments. Please try again.')
		}
	}

	function handleCancelUpdate() {
		setShowConfirmDialog(false)
		setPendingAssignments(null)
	}

	function handleCopyAmToPm() {
		setPmAssignments(amAssignments.map(assignment => ({ ...assignment })))
	}

	if (isLoadingCachedData ?? loading) return <div className="p-4">{t('loading')}</div>
	if (error) return <div className="p-4 text-red-500">{error}</div>
	if (!selectedClass) return <div className="p-4">{t('noClassSelected')}</div>

	return (
		<div className="container mx-auto p-4">
			<Card>
				<CardHeader>
					<CardTitle>{t('teacherAssignment')} - {selectedClass}</CardTitle>
				</CardHeader>
				<CardContent>
					{error && (
						<div className="mb-4 p-4 text-red-500 bg-red-50 rounded-md">
							{error}
						</div>
					)}

					{hasExistingAssignments && (
						<div className="mb-4 p-4 bg-muted text-muted-foreground rounded-lg">
							{t('existingAssignmentsWarning')}
						</div>
					)}

					<div className="mb-4">
						<Label htmlFor="weekday">{t('rotationDay')}</Label>
						<Select
							value={selectedWeekday?.toString() ?? ''}
							onValueChange={(value) => setSelectedWeekday(parseInt(value))}
						>
							<SelectTrigger className="w-[180px]">
								<SelectValue placeholder={t('selectWeekday')} />
							</SelectTrigger>
							<SelectContent>
								{WEEKDAYS.map((day) => (
									<SelectItem key={day.value} value={day.value.toString()}>
										{day.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* AM Assignments */}
					<Card className="mb-8">
						<CardHeader>
							<CardTitle>{t('morningAssignments')}</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{groups.map((group) => (
									<div key={group.id} className="p-4 border rounded-lg">
										<div className="flex justify-between items-center mb-4">
											<h3 className="font-semibold">{t('group')} {group.id}</h3>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleClearRow('am', group.id)}
												className="text-destructive hover:text-destructive/90"
											>
												{t('clearRow')}
											</Button>
										</div>
										<div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
											<div>
												<Label className="block text-sm font-medium mb-1">{t('teacher')}</Label>
												<TeacherSelect
													value={amAssignments.find(a => a.groupId === group.id)?.teacherId}
													onChange={(value) => handleAssignmentChange('am', group.id, 'teacherId', value)}
													teachers={teachers}
												/>
											</div>
											<div>
												<Label className="block text-sm font-medium mb-1">{t('subject')}</Label>
												<SubjectSelect
													value={getDisplayValue(amAssignments.find(a => a.groupId === group.id) ?? { groupId: group.id, teacherId: 0, subjectId: 0, learningContentId: 0, roomId: 0 }, 'subject')}
													onChange={(value) => handleStringFieldChange('am', group.id, 'subject', value)}
													subjects={subjects}
												/>
											</div>
											<div>
												<Label className="block text-sm font-medium mb-1">{t('learningContent')}</Label>
												<LearningContentSelect
													value={getDisplayValue(amAssignments.find(a => a.groupId === group.id) ?? { groupId: group.id, teacherId: 0, subjectId: 0, learningContentId: 0, roomId: 0 }, 'learningContent')}
													onChange={(value) => handleStringFieldChange('am', group.id, 'learningContent', value)}
													learningContents={learningContents}
												/>
											</div>
											<div>
												<Label className="block text-sm font-medium mb-1">{t('room')}</Label>
												<RoomSelect
													value={getDisplayValue(amAssignments.find(a => a.groupId === group.id) ?? { groupId: group.id, teacherId: 0, subjectId: 0, learningContentId: 0, roomId: 0 }, 'room')}
													onChange={(value) => handleStringFieldChange('am', group.id, 'room', value)}
													rooms={rooms}
												/>
											</div>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					{/* PM Assignments */}
					<Card>
						<CardHeader>
							<div className="flex justify-between items-center">
								<CardTitle>{t('afternoonAssignments')}</CardTitle>
								<Button
									variant="outline"
									size="sm"
									onClick={handleCopyAmToPm}
									className="ml-4"
								>
									{t('copyFromAm')}
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{groups.map((group) => (
									<div key={group.id} className="p-4 border rounded-lg">
										<div className="flex justify-between items-center mb-4">
											<h3 className="font-semibold">{t('group')} {group.id}</h3>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleClearRow('pm', group.id)}
												className="text-destructive hover:text-destructive/90"
											>
												{t('clearRow')}
											</Button>
										</div>
										<div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
											<div>
												<Label className="block text-sm font-medium mb-1">{t('teacher')}</Label>
												<TeacherSelect
													value={pmAssignments.find(a => a.groupId === group.id)?.teacherId}
													onChange={(value) => handleAssignmentChange('pm', group.id, 'teacherId', value)}
													teachers={teachers}
												/>
											</div>
											<div>
												<Label className="block text-sm font-medium mb-1">{t('subject')}</Label>
												<SubjectSelect
													value={getDisplayValue(pmAssignments.find(a => a.groupId === group.id) ?? { groupId: group.id, teacherId: 0, subjectId: 0, learningContentId: 0, roomId: 0 }, 'subject')}
													onChange={(value) => handleStringFieldChange('pm', group.id, 'subject', value)}
													subjects={subjects}
												/>
											</div>
											<div>
												<Label className="block text-sm font-medium mb-1">{t('learningContent')}</Label>
												<LearningContentSelect
													value={getDisplayValue(pmAssignments.find(a => a.groupId === group.id) ?? { groupId: group.id, teacherId: 0, subjectId: 0, learningContentId: 0, roomId: 0 }, 'learningContent')}
													onChange={(value) => handleStringFieldChange('pm', group.id, 'learningContent', value)}
													learningContents={learningContents}
												/>
											</div>
											<div>
												<Label className="block text-sm font-medium mb-1">{t('room')}</Label>
												<RoomSelect
													value={getDisplayValue(pmAssignments.find(a => a.groupId === group.id) ?? { groupId: group.id, teacherId: 0, subjectId: 0, learningContentId: 0, roomId: 0 }, 'room')}
													onChange={(value) => handleStringFieldChange('pm', group.id, 'room', value)}
													rooms={rooms}
												/>
											</div>
										</div>
									</div>
								))}
							</div>
						</CardContent>
					</Card>

					<div className="mt-8 flex justify-end gap-4">
						<Button variant="outline" onClick={() => router.back()}>
							{t('back')}
						</Button>
						<Button onClick={handleNext} disabled={loading}>
							{loading ? t('saving') : t('next')}
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Confirmation Dialog */}
			{showConfirmDialog && (
				<div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center">
					<div className="bg-card p-6 rounded-lg max-w-md shadow-xl">
						<h2 className="text-xl font-bold mb-4">{t('updateAssignmentsTitle')}</h2>
						<p className="mb-6">{t('existingAssignmentsWarning')}</p>
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