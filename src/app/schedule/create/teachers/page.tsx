'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCachedData } from '@/hooks/use-cached-data'
import { useClassDataByName } from '@/hooks/use-class-data'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { captureFrontendError } from '@/lib/frontend-error'
import { useSchoolYear } from '@/contexts/school-year-context'
import { fetchAndUnwrap, getApiErrorMessage, parseJsonSafe, unwrapData } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AssignmentPeriodSection } from '@/components/schedule/assignment-period-section'

const WEEKDAY_LABELS_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'] as const

const SCHEDULE_FIELD_LABEL_DE: Record<string, string> = {
	teacher: 'Lehrer',
	subject: 'Fach',
	learningContent: 'Lerninhalt',
	room: 'Raum',
}

interface Student {
	id: number
	firstName: string
	lastName: string
	class: string
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
	pmTrack?: 'ALL' | 'A' | 'B'
	// Custom values for when user enters their own text
	customSubject?: string
	customLearningContent?: string
	customRoom?: string
}

interface AssignmentsResponse {
	assignments: { groupId: number; studentIds: number[] }[]
}

interface TeacherAssignmentResponse {
	groupId: number
	teacherId: number
	subject: string
	learningContent: string
	room: string
	pmTrack?: 'ALL' | 'A' | 'B'
}

interface TeacherAssignmentsResponse {
	amAssignments: TeacherAssignmentResponse[]
	pmAssignments: TeacherAssignmentResponse[]
	selectedWeekday?: number
}

function mapTeacherRowsToAssignments(
	assignments: TeacherAssignmentResponse[],
	subjects: { id: number; name: string }[],
	learningContents: { id: number; name: string }[],
	rooms: { id: number; name: string }[],
	includePmTrack: boolean
): TeacherAssignment[] {
	return assignments.map((assignment) => {
		const subject = subjects.find(s => s.name === assignment.subject)
		const learningContent = learningContents.find(lc => lc.name === assignment.learningContent)
		const room = rooms.find(r => r.name === assignment.room)
		const base: TeacherAssignment = {
			groupId: assignment.groupId,
			teacherId: assignment.teacherId,
			subjectId: subject?.id ?? 0,
			learningContentId: learningContent?.id ?? 0,
			roomId: room?.id ?? 0
		}
		if (includePmTrack) {
			const pt = assignment.pmTrack
			base.pmTrack = pt === 'A' || pt === 'B' || pt === 'ALL' ? pt : 'ALL'
		}
		return base
	})
}

function mapAssignmentsToSavePayload(
	assignments: TeacherAssignment[],
	subjects: { id: number; name: string }[],
	learningContents: { id: number; name: string }[],
	rooms: { id: number; name: string }[],
	includePmTrack: boolean
): Array<{
	groupId: number
	teacherId: number
	subject: string
	learningContent: string
	room: string
	pmTrack?: 'ALL' | 'A' | 'B'
}> {
	return assignments.map((assignment) => {
		const subject = assignment.customSubject ?? subjects.find(s => s.id === assignment.subjectId)?.name ?? ''
		const learningContent =
			assignment.customLearningContent ?? learningContents.find(lc => lc.id === assignment.learningContentId)?.name ?? ''
		const room = assignment.customRoom ?? rooms.find(r => r.id === assignment.roomId)?.name ?? ''
		const row: {
			groupId: number
			teacherId: number
			subject: string
			learningContent: string
			room: string
			pmTrack?: 'ALL' | 'A' | 'B'
		} = {
			groupId: assignment.groupId,
			teacherId: assignment.teacherId,
			subject,
			learningContent,
			room
		}
		if (includePmTrack) {
			const pt = assignment.pmTrack
			row.pmTrack = pt === 'A' || pt === 'B' ? pt : 'ALL'
		}
		return row
	})
}

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
	const { selectedYear } = useSchoolYear()
	const schoolYearId = selectedYear?.id
	const existingAssignmentsWarning =
		'Es existieren bereits eine Lehrerzuweisung für diese Klasse. Änderungen werden die bestehenden Zuweisungen aktualisieren.'
	const selectedClass = searchParams.get('class')
	const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
	const weekdayFromUrl = searchParams.get('weekday')
	const parsedWeekday = weekdayFromUrl ? parseInt(weekdayFromUrl, 10) : NaN
	const initialWeekday =
		!Number.isNaN(parsedWeekday) && parsedWeekday >= 1 && parsedWeekday <= 5 ? parsedWeekday : 1
	const [selectedWeekday, setSelectedWeekday] = useState<number>(initialWeekday)

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
	const { data: classData } = useClassDataByName(selectedClass ?? null)
	
	useEffect(() => {
		if (classData) {
			setSelectedClassId(classData.id)
		} else if (!selectedClass) {
			setSelectedClassId(null)
		}
	}, [classData, selectedClass])

	useEffect(() => {
		const w = searchParams.get('weekday')
		const n = w ? parseInt(w, 10) : NaN
		if (!Number.isNaN(n) && n >= 1 && n <= 5) {
			setSelectedWeekday(n)
		}
	}, [searchParams])

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
					roomId: 0,
					pmTrack: 'ALL' as const
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
				const wd = selectedWeekday
				const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
				const groupsData = await fetchAndUnwrap<AssignmentsResponse>(
					`/api/schedules/assignments?classId=${selectedClassId}&weekday=${wd}${yearQ}`
				)
				const studentsRes = await fetch(`/api/students?class=${encodeURIComponent(selectedClass)}${yearQ}`)
				let studentsList: Student[] = []
				if (studentsRes.ok) {
					const sp = await parseJsonSafe(studentsRes)
					const raw = sp as { data?: Student[] } | Student[]
					studentsList = Array.isArray(raw) ? raw : (raw.data ?? [])
				}
				setGroups(
					groupsData.assignments.map(assignment => ({
						id: assignment.groupId,
						students: assignment.studentIds
							.map(id => studentsList.find(s => s.id === id))
							.filter((s): s is Student => s != null)
					}))
				)

				const teacherAssignmentsUrl = `/api/schedules/teacher-assignments?classId=${selectedClassId}&selectedWeekday=${wd}${yearQ}`
				const teacherAssignmentsRes = await fetch(teacherAssignmentsUrl)
				if (teacherAssignmentsRes.ok) {
					const teacherAssignmentsPayload = await parseJsonSafe(teacherAssignmentsRes)
					const teacherAssignmentsData = unwrapData<TeacherAssignmentsResponse>(teacherAssignmentsPayload)
					const hasExistingAmAssignments = teacherAssignmentsData.amAssignments.some(a => a.teacherId !== 0)
					const hasExistingPmAssignments = teacherAssignmentsData.pmAssignments.some(a => a.teacherId !== 0)
					
					// Initialize base assignments for all groups
					const initialAssignments: TeacherAssignment[] = groupsData.assignments.map(assignment => ({
						groupId: assignment.groupId,
						teacherId: 0,
						subjectId: 0,
						learningContentId: 0,
						roomId: 0,
						pmTrack: 'ALL'
					}))

					// Map string values back to IDs
					const mapAmFromResponse = (rows: TeacherAssignmentResponse[]) =>
						mapTeacherRowsToAssignments(rows, subjects, learningContents, rooms, false)
					const mapPmFromResponse = (rows: TeacherAssignmentResponse[]) =>
						mapTeacherRowsToAssignments(rows, subjects, learningContents, rooms, true)

					// Set AM assignments
					if (hasExistingAmAssignments) {
						setAmAssignments(mapAmFromResponse(teacherAssignmentsData.amAssignments))
					} else {
						setAmAssignments(initialAssignments)
					}

					// Set PM assignments
					if (hasExistingPmAssignments) {
						setPmAssignments(mapPmFromResponse(teacherAssignmentsData.pmAssignments))
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
						roomId: 0,
						pmTrack: 'ALL'
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
				setError('Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut.')
			} finally {
				setLoading(false)
			}
		}
		void fetchData()
	}, [selectedClass, selectedClassId, schoolYearId, isLoadingCachedData, subjects, learningContents, rooms, selectedWeekday])

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
					pmTrack: 'ALL',
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
					pmTrack: 'ALL',
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
						pmTrack: 'ALL',
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
			const amPayload = mapAssignmentsToSavePayload(validAmAssignments, subjects, learningContents, rooms, false)
			const pmPayload = mapAssignmentsToSavePayload(validPmAssignments, subjects, learningContents, rooms, true)

			// If no changes or no existing assignments, proceed with saving
			if (!selectedClassId) throw new Error('Class ID not available')
			const response = await fetch('/api/schedules/teacher-assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					classId: selectedClassId,
					...(schoolYearId != null && { schoolYearId }),
					amAssignments: amPayload,
					pmAssignments: pmPayload,
					updateExisting: true,
					selectedWeekday: selectedWeekday ?? 1
				}),
			})

			if (!response.ok) {
				const errorData = await parseJsonSafe(response)
				const conflictCode = (
					errorData &&
					typeof errorData === 'object' &&
					'error' in errorData &&
					typeof (errorData as { error?: { code?: string } }).error === 'object'
				)
					? (errorData as { error?: { code?: string } }).error?.code
					: undefined
				if (response.status === 409 && conflictCode === 'EXISTING_ASSIGNMENTS') {
					setPendingAssignments({
						amAssignments: validAmAssignments,
						pmAssignments: validPmAssignments
					})
					setShowConfirmDialog(true)
					return
				}
				throw new Error(getApiErrorMessage(errorData, 'Failed to save teacher assignments'))
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
			setError('Zuweisungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.')
		}
	}

	async function handleConfirmUpdate() {
		if (!pendingAssignments || !selectedClassId) return

		try {
			const amPayload = mapAssignmentsToSavePayload(pendingAssignments.amAssignments, subjects, learningContents, rooms, false)
			const pmPayload = mapAssignmentsToSavePayload(pendingAssignments.pmAssignments, subjects, learningContents, rooms, true)

			const response = await fetch('/api/schedules/teacher-assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					classId: selectedClassId,
					...(schoolYearId != null && { schoolYearId }),
					amAssignments: amPayload,
					pmAssignments: pmPayload,
					updateExisting: true,
					selectedWeekday: selectedWeekday ?? 1
				}),
			})

			if (!response.ok) {
				const errorData = await parseJsonSafe(response)
				throw new Error(getApiErrorMessage(errorData, 'Failed to update teacher assignments'))
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
			setError('Zuweisungen konnten nicht aktualisiert werden. Bitte versuchen Sie es erneut.')
		}
	}

	function handleCancelUpdate() {
		setShowConfirmDialog(false)
		setPendingAssignments(null)
	}

	function handleCopyAmToPm() {
		setPmAssignments(amAssignments.map(assignment => ({ ...assignment, pmTrack: 'ALL' as const })))
	}

	if (isLoadingCachedData ?? loading) return <div className="p-4">Laden...</div>
	if (error) return <div className="p-4 text-destructive">{error}</div>
	if (!selectedClass) return <div className="p-4">Keine Klasse ausgewählt</div>

	return (
		<div className="container mx-auto p-4">
			<Card>
				<CardHeader>
					<CardTitle>Lehrerzuweisung - {selectedClass}</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="mb-4 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
						Weisen Sie jeder Gruppe Lehrperson, Fach, Lerninhalt und Raum zu. Sie können Einträge auch manuell ergänzen oder aus dem Vormittag übernehmen.
					</div>
					{error && (
						<div className="mb-4 p-4 state-danger-soft rounded-md">
							{error}
						</div>
					)}

					{hasExistingAssignments && (
						<div className="mb-4 p-4 bg-muted text-muted-foreground rounded-lg">
							{existingAssignmentsWarning}
						</div>
					)}

					<p className="text-sm text-muted-foreground mb-4">
						Turnustag: {WEEKDAY_LABELS_DE[selectedWeekday - 1] ?? 'Montag'}
					</p>

					<AssignmentPeriodSection
						title="Vormittagszuweisungen"
						groups={groups}
						assignments={amAssignments}
						teachers={teachers}
						subjects={subjects}
						learningContents={learningContents}
						rooms={rooms}
						onAssignmentChange={(groupId, field, value) => handleAssignmentChange('am', groupId, field, value)}
						onStringFieldChange={(groupId, field, value) => handleStringFieldChange('am', groupId, field, value)}
						onClearRow={(groupId) => handleClearRow('am', groupId)}
						getDisplayValue={getDisplayValue}
					/>
					<AssignmentPeriodSection
						title="Nachmittagszuweisungen"
						groups={groups}
						assignments={pmAssignments}
						teachers={teachers}
						subjects={subjects}
						learningContents={learningContents}
						rooms={rooms}
						onAssignmentChange={(groupId, field, value) => handleAssignmentChange('pm', groupId, field, value)}
						onStringFieldChange={(groupId, field, value) => handleStringFieldChange('pm', groupId, field, value)}
						onClearRow={(groupId) => handleClearRow('pm', groupId)}
						getDisplayValue={getDisplayValue}
						showPmTrack
						rightAction={
							<Button variant="outline" size="sm" onClick={handleCopyAmToPm} className="ml-4">
								Von Vormittag kopieren
							</Button>
						}
					/>

					<div className="mt-8 flex justify-end gap-4">
						<Button variant="outline" onClick={() => router.back()}>
							Zurück
						</Button>
						<Button onClick={handleNext} disabled={loading}>
							{loading ? 'Wird gespeichert...' : 'Weiter'}
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Confirmation Dialog */}
			<Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Zuweisungen aktualisieren</DialogTitle>
					</DialogHeader>
					<p className="mb-2">{existingAssignmentsWarning}</p>
					<div className="flex justify-end space-x-4">
						<Button variant="outline" onClick={handleCancelUpdate}>
							Abbrechen
						</Button>
						<Button onClick={handleConfirmUpdate}>
							Aktualisieren
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Error Dialog */}
			<Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Validierungsfehler</DialogTitle>
					</DialogHeader>
					<div className="mb-2 space-y-4">
							{validationErrors.am.length > 0 && (
								<div>
									<h3 className="font-semibold mb-2 text-foreground">Vormittagszuweisungen</h3>
									<ul className="list-disc pl-5 space-y-1 text-foreground">
										{validationErrors.am.map(error => (
											<li key={error.groupId}>
												Gruppe {error.groupId}: {error.missingFields.map((field) => SCHEDULE_FIELD_LABEL_DE[field] ?? field).join(', ')}
											</li>
										))}
									</ul>
								</div>
							)}
							{validationErrors.pm.length > 0 && (
								<div>
									<h3 className="font-semibold mb-2 text-foreground">Nachmittagszuweisungen</h3>
									<ul className="list-disc pl-5 space-y-1 text-foreground">
										{validationErrors.pm.map(error => (
											<li key={error.groupId}>
												Gruppe {error.groupId}: {error.missingFields.map((field) => SCHEDULE_FIELD_LABEL_DE[field] ?? field).join(', ')}
											</li>
										))}
									</ul>
								</div>
							)}
					</div>
					<div className="flex justify-end">
						<Button onClick={() => setShowErrorDialog(false)}>OK</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
} 