'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useTranslation } from 'next-i18next'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle } from 'lucide-react'
import { captureFrontendError } from '@/lib/frontend-error'
import { StudentItem } from '@/components/schedule/student-item'
import { GroupContainer } from '@/components/schedule/group-container'
import { CombineClassesDialog } from '@/components/schedule/combine-classes-dialog'
import { useClassDataByName } from '@/hooks/use-class-data'
import { useGroupAssignments } from '@/hooks/use-group-assignments'
import { useSchoolYear } from '@/contexts/school-year-context'
import { fetchAndUnwrap, getApiErrorMessage, parseJsonSafe, unwrapData } from '@/lib/api-client'


interface Student {
	id: number
	firstName: string
	lastName: string
	class: string
	originalClass?: string // For combined classes, shows which class the student originally came from
}

interface Group {
	id: number
	students: Student[]
}

interface Assignment {
	groupId: number
	studentIds: number[]
}

interface Class {
	id: number
	name: string
	description: string | null
}

interface AssignmentsResponse {
	assignments: Assignment[]
	unassignedStudents: Student[]
}

// Add constant for unassigned group ID
const UNASSIGNED_GROUP_ID = 0

const WEEKDAY_LABEL_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const

// Add constant for maximum group size
const MAX_GROUP_SIZE = 12
// Add constant for maximum supported students (4 groups × 12 students)
const MAX_SUPPORTED_STUDENTS = 48


/**
 * Distributes students evenly across groups, ensuring the difference between the largest and smallest group is at most 1.
 *
 * @param students - Array of students to distribute
 * @param numGroups - Number of groups to distribute students into
 * @returns Array of groups with evenly distributed students
 */
function distributeStudentsEvenly(students: Student[], numGroups: number): Group[] {
	const sortedStudents = [...students].sort((a, b) => 
		a.lastName.localeCompare(b.lastName)
	)
	
	// Calculate base students per group and remainder
	const baseStudentsPerGroup = Math.floor(sortedStudents.length / numGroups)
	const remainder = sortedStudents.length % numGroups
	
	const groups: Group[] = [
		// Always include unassigned group first
		{
			id: UNASSIGNED_GROUP_ID,
			students: []
		},
		// Add regular groups
		...Array.from({ length: numGroups }, (_, i) => {
			// First 'remainder' groups get one extra student
			const studentsInThisGroup = baseStudentsPerGroup + (i < remainder ? 1 : 0)
			const startIndex = i * baseStudentsPerGroup + Math.min(i, remainder)
			const endIndex = startIndex + studentsInThisGroup
			
			return {
				id: i + 1,
				students: sortedStudents.slice(startIndex, endIndex)
			}
		})
	]
	
	return groups
}

/**
 * Provides an interactive interface for assigning students to groups within a selected class using drag-and-drop.
 *
 * Enables teachers to pick a class and weekday, then assign students to groups via drag-and-drop and save per-weekday group assignments. Integrates with backend APIs for data retrieval and persistence, enforces maximum group size constraints, and prompts for confirmation when updating existing assignments.
 *
 * @returns The React component for the class scheduling and group assignment interface.
 *
 * @remark The unassigned group (ID 0) is always present. Students cannot be moved into the unassigned group via drag-and-drop, but can be moved there using the remove action. If a group assignment would exceed the maximum group size, a warning dialog is shown and the action is blocked. When existing assignments are detected and changes are made, a confirmation dialog is displayed before updating assignments.
 */
export default function ScheduleClassSelectPage() {
	const router = useRouter()
	const { t } = useTranslation('schedule')
	const { t: tCommon } = useTranslation('common')
	const searchParams = useSearchParams()
	const weekdayRaw = searchParams.get('weekday')
	const parsedWeekFromUrl = weekdayRaw ? parseInt(weekdayRaw, 10) : NaN
	const scheduleWeekday =
		!Number.isNaN(parsedWeekFromUrl) && parsedWeekFromUrl >= 1 && parsedWeekFromUrl <= 5
			? parsedWeekFromUrl
			: null
	const needsWeekdayPick = scheduleWeekday === null

	const [classes, setClasses] = useState<Class[]>([])
	const [selectedClass, setSelectedClass] = useState<string>(searchParams.get('class') ?? '')
	const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
	const [students, setStudents] = useState<Student[]>([])
	const [loading, setLoading] = useState<boolean>(false)
	const [loadingClasses, setLoadingClasses] = useState<boolean>(true)
	const [error, setError] = useState<string | null>(null)
	const [numberOfGroups, setNumberOfGroups] = useState<number>(2)
	const [groups, setGroups] = useState<Group[]>([
		{
			id: UNASSIGNED_GROUP_ID,
			students: []
		}
	])
	const [activeStudent, setActiveStudent] = useState<Student | null>(null)
	const [showConfirmDialog, setShowConfirmDialog] = useState(false)
	const [showMaxSizeDialog, setShowMaxSizeDialog] = useState(false)
	const [pendingAssignments, setPendingAssignments] = useState<{
		assignments: Assignment[]
		removedStudentIds: number[]
	} | null>(null)
	const hasExistingAssignmentsRef = useRef(false)
	const [showCombineClassesDialog, setShowCombineClassesDialog] = useState(false)
	const [combineClasses, setCombineClasses] = useState({
		class1Id: '',
		class2Id: '',
		combinedClassName: ''
	})
	const [combiningClasses, setCombiningClasses] = useState(false)
	const [isManualGroupChange, setIsManualGroupChange] = useState(false)
	const [entrySelectedWeekday, setEntrySelectedWeekday] = useState<number | null>(null)

	/**
	 * Determines whether all groups, except the unassigned group, do not exceed the maximum allowed size.
	 *
	 * @param groups - Array of groups to validate.
	 * @returns True if every group (excluding the unassigned group) has a size less than or equal to {@link MAX_GROUP_SIZE}; otherwise, false.
	 */
	function checkGroupSizes(groups: Group[]): boolean {
		return groups.every(group => 
			group.id === UNASSIGNED_GROUP_ID || group.students.length <= MAX_GROUP_SIZE
		)
	}

	/**
	 * Resets the group assignments to two groups, evenly distributing students by last name.
	 *
	 * If redistributing students would cause any group to exceed the maximum allowed size, displays a warning dialog instead of resetting.
	 */
	function handleReset() {
		// Calculate appropriate number of groups based on student count
		const resetGroups = students.length > 36 ? 4 : 
			students.length > 18 ? 3 : 2
		
		setNumberOfGroups(resetGroups)
		
		// Check if any group would exceed the maximum size
		const maxStudentsPerGroup = Math.ceil(students.length / resetGroups)
		if (maxStudentsPerGroup > MAX_GROUP_SIZE) {
			setShowMaxSizeDialog(true)
			return
		}

		const newGroups = distributeStudentsEvenly(students, resetGroups)
		setGroups(newGroups)
	}

	const sensors = useSensors(
		useSensor(MouseSensor, {
			activationConstraint: {
				distance: 10,
			},
		}),
		useSensor(TouchSensor, {
			activationConstraint: {
				delay: 250,
				tolerance: 5,
			},
		})
	)

	const { selectedYear } = useSchoolYear()
	const schoolYearId = selectedYear?.id
	const updateAssignmentsMessage = t('updateAssignmentsMessage').replace('Lehrerzuweisungen', 'Schülerzuweisungen')

	// Fetch classes using React Query (filtered by selected school year)
	const { data: classesData, isLoading: isLoadingClassesData } = useQuery<Class[]>({
		queryKey: ['classes', schoolYearId],
		queryFn: async () => {
			const url = schoolYearId != null ? `/api/classes?schoolYearId=${schoolYearId}` : '/api/classes'
			return fetchAndUnwrap<Class[]>(url)
		},
		enabled: schoolYearId != null,
		staleTime: 1000 * 60 * 5, // 5 minutes
	})

	useEffect(() => {
		if (classesData) {
			setClasses(classesData)
			setLoadingClasses(false)
		}
		if (isLoadingClassesData !== undefined) {
			setLoadingClasses(isLoadingClassesData)
		}
	}, [classesData, isLoadingClassesData])

	// Resolve className to classId when selectedClass changes
	const { data: classData } = useClassDataByName(selectedClass || null)
	
	useEffect(() => {
		if (classData) {
			setSelectedClassId(classData.id)
		} else if (!selectedClass) {
			setSelectedClassId(null)
		}
	}, [classData, selectedClass])

	// Per-weekday schedule presence (Mo–Fr) for entry step
	const { data: weekdayPresence, isLoading: isLoadingPresence } = useQuery<Record<number, boolean>>({
		queryKey: ['schedule-weekday-presence', selectedClass, schoolYearId],
		queryFn: async () => {
			if (!selectedClass || schoolYearId == null) throw new Error('Class and school year required')
			const out: Record<number, boolean> = {}
			await Promise.all(
				[1, 2, 3, 4, 5].map(async (wd) => {
					const url = `/api/schedules?classId=${encodeURIComponent(selectedClass)}&schoolYearId=${schoolYearId}&weekday=${wd}`
					const res = await fetch(url)
					out[wd] = res.ok
				})
			)
			return out
		},
		enabled: needsWeekdayPick && !!selectedClass && schoolYearId != null,
		staleTime: 1000 * 60,
	})

	// Fetch students
	const { data: studentsData, isLoading: isLoadingStudents } = useQuery<Student[]>({
		queryKey: ['students', selectedClass],
		queryFn: async () => {
			if (!selectedClass) throw new Error('Class name is required')
			return fetchAndUnwrap<Student[]>(`/api/students?class=${selectedClass}`)
		},
		enabled: !!selectedClass && !needsWeekdayPick,
		staleTime: 1000 * 60 * 5, // 5 minutes
	})

	// Fetch group assignments
	const { data: assignmentsData, isLoading: isLoadingAssignments } = useGroupAssignments(
		needsWeekdayPick ? null : selectedClassId,
		{
			weekday: scheduleWeekday ?? 1,
			schoolYearId: schoolYearId ?? undefined,
		}
	)

	// Update students when data is fetched
	useEffect(() => {
		if (studentsData) {
			setStudents(studentsData)
		}
	}, [studentsData])

	// Initialize groups when students and assignments are loaded
	useEffect(() => {
		if (needsWeekdayPick || !selectedClass || !selectedClassId || isLoadingStudents || isLoadingAssignments) {
			setLoading(needsWeekdayPick ? false : isLoadingStudents || isLoadingAssignments)
			return
		}

		if (!studentsData) return

		setLoading(true)
		setIsManualGroupChange(false) // Reset manual change flag when loading new class

		try {
			// Calculate initial number of groups based on student count
			const initialGroups = studentsData.length > 36 ? 4 : 
				studentsData.length > 18 ? 3 : 2
			setNumberOfGroups(initialGroups)

			// Check if class has too many students
			if (studentsData.length > MAX_SUPPORTED_STUDENTS) {
				setError(t('tooManyStudentsError', { max: MAX_SUPPORTED_STUDENTS, count: studentsData.length }))
				setLoading(false)
				return
			}

			if (assignmentsData?.assignments && assignmentsData.assignments.length > 0) {
				// Only count real groups: exclude unassigned (groupId 0) and empty rows
				const regularAssignments = assignmentsData.assignments.filter(
					a => a.groupId !== UNASSIGNED_GROUP_ID && a.studentIds.length > 0
				)
				const existingGroups: Group[] = [
					// Always include unassigned group first
					{
						id: UNASSIGNED_GROUP_ID,
						students: (assignmentsData.unassignedStudents || []).map(s => ({ ...s, class: selectedClass || '' }))
					},
					// Then add only regular (non-empty, non-unassigned) groups
					...regularAssignments.map(assignment => ({
						id: assignment.groupId,
						students: assignment.studentIds
							.map(id => studentsData.find(s => s.id === id))
							.filter((s): s is Student => s !== undefined)
					}))
				]
				setGroups(existingGroups)
				setNumberOfGroups(regularAssignments.length)
				hasExistingAssignmentsRef.current = true
			} else {
				// Otherwise, create default groups with even distribution
				const newGroups = distributeStudentsEvenly(studentsData, initialGroups)
				setGroups(newGroups)
				hasExistingAssignmentsRef.current = false
			}
		} catch (err) {
			console.error('Error processing students and assignments:', err)
			captureFrontendError(err, {
				location: 'schedule/create',
				type: 'process-students-assignments',
				extra: {
					selectedClass
				}
			})
			setError('Fehler beim Laden der Schüler und Zuweisungen.')
		} finally {
			setLoading(false)
		}
	}, [needsWeekdayPick, selectedClass, selectedClassId, studentsData, assignmentsData, isLoadingStudents, isLoadingAssignments, t])

	useEffect(() => {
		if (students.length === 0) return

		// Only handle manual group changes, not initial load
		if (isManualGroupChange) {
			setGroups(currentGroups => {
				const unassignedGroup = currentGroups.find(g => g.id === UNASSIGNED_GROUP_ID) ?? 
					{ id: UNASSIGNED_GROUP_ID, students: [] }
				
				const regularGroups = currentGroups.filter(g => g.id !== UNASSIGNED_GROUP_ID)
				const currentGroupCount = regularGroups.length
				
				if (numberOfGroups > currentGroupCount) {
					// Increasing groups: keep existing assignments, add empty groups
					const newGroups = [...regularGroups]
					for (let i = currentGroupCount; i < numberOfGroups; i++) {
						newGroups.push({
							id: i + 1,
							students: []
						})
					}
					return [unassignedGroup, ...newGroups]
				} else if (numberOfGroups < currentGroupCount) {
					// Decreasing groups: redistribute students from removed groups
					const groupsToKeep = regularGroups.slice(0, numberOfGroups)
					const groupsToRemove = regularGroups.slice(numberOfGroups)
					
					// Collect students from groups being removed
					const studentsToRedistribute = groupsToRemove.flatMap(group => group.students)
					
					// Try to redistribute students to remaining groups
					const newGroups = [...groupsToKeep]
					const studentsToUnassign: Student[] = []
					
					for (const student of studentsToRedistribute) {
						// Find a group with space
						const targetGroup = newGroups.find(group => group.students.length < MAX_GROUP_SIZE)
						if (targetGroup) {
							targetGroup.students.push(student)
							// Keep groups sorted by last name
							targetGroup.students.sort((a, b) => a.lastName.localeCompare(b.lastName))
						} else {
							// No space in any group, move to unassigned
							studentsToUnassign.push(student)
						}
					}
					
					// Add students that couldn't fit to unassigned group
					const updatedUnassignedGroup = {
						...unassignedGroup,
						students: [...unassignedGroup.students, ...studentsToUnassign].sort((a, b) => 
							a.lastName.localeCompare(b.lastName)
						)
					}
					
					return [updatedUnassignedGroup, ...newGroups]
				}
				
				// No change in group count
				return currentGroups
			})
			
			// Reset the manual change flag after handling
			setIsManualGroupChange(false)
		}
	}, [numberOfGroups, students, isManualGroupChange])

	// Add a new effect to handle group ID updates - only for new assignments or manual changes
	useEffect(() => {
		// Only renumber group IDs if we don't have existing assignments OR if it's a manual group change
		if (!hasExistingAssignmentsRef.current || isManualGroupChange) {
			setGroups(currentGroups => {
				const unassignedGroup =
					currentGroups.find(g => g.id === UNASSIGNED_GROUP_ID)
					?? { id: UNASSIGNED_GROUP_ID, students: [] }
				const regularGroups = currentGroups
					.filter(g => g.id !== UNASSIGNED_GROUP_ID)
					.sort((a, b) => a.id - b.id)        // keep deterministic order

				// Only renumber if we have groups that need renumbering
				// (i.e., if we have more groups than expected or gaps in numbering)
				const needsRenumbering = regularGroups.some((group, index) => group.id !== index + 1) ||
					regularGroups.length !== numberOfGroups

				if (needsRenumbering) {
					return [
						unassignedGroup!,
						...regularGroups.slice(0, numberOfGroups).map((group, index) => ({
							...group,
							id: index + 1
						}))
					]
				}

				return currentGroups
			})
		}
		// If we have existing assignments and it's not a manual change, preserve the original group IDs from the database
	}, [numberOfGroups, isManualGroupChange])

	// Add effect to ensure unassigned group is always present
	useEffect(() => {
		setGroups(currentGroups => {
			// If unassigned group doesn't exist, add it
			if (!currentGroups.some(g => g.id === UNASSIGNED_GROUP_ID)) {
				return [
					{
						id: UNASSIGNED_GROUP_ID,
						students: []
					},
					...currentGroups
				]
			}
			return currentGroups
		})
	}, [])

	// Add effect to check group sizes when groups change
	useEffect(() => {
		if (!checkGroupSizes(groups)) {
			setError(t('maxGroupSizeError'))
		} else {
			setError(null)
		}
	}, [groups, t])

	/**
	 * Updates the number of groups based on the selected value from the group size dropdown.
	 *
	 * @param e - The change event from the group size selector.
	 */
	function handleGroupSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
		setNumberOfGroups(Number(e.target.value))
		setIsManualGroupChange(true)
	}

	async function handleNext() {
		try {
			if (scheduleWeekday == null || !schoolYearId) {
				setError('Schuljahr fehlt oder ungültiger Wochentag. Bitte Seite neu laden oder Schuljahr wählen.')
				return
			}

			// Get all students that are still in groups
			const activeStudents = groups.flatMap(group => group.students)
			const activeStudentIds = activeStudents.map(student => student.id)

			// Get all students that were removed
			const removedStudents = students.filter(student => !activeStudentIds.includes(student.id))

			// Store the group assignments
			const assignments = groups.map(group => ({
				groupId: group.id,
				studentIds: group.students.map(student => student.id)
			}))

			// Check if there are existing assignments
			if (!selectedClassId) throw new Error('Class ID not available')
			const yearQ = `&schoolYearId=${schoolYearId}`
			const existingAssignmentsData = await fetchAndUnwrap<AssignmentsResponse>(
				`/api/schedules/assignments?classId=${selectedClassId}&weekday=${scheduleWeekday}${yearQ}`
			)

			// Only show confirmation if there are existing assignments
			if (existingAssignmentsData.assignments && existingAssignmentsData.assignments.length > 0) {
				// Check if the assignments are different from what's currently on screen
				const hasChanges = existingAssignmentsData.assignments.some(existingAssignment => {
					const currentAssignment = assignments.find(a => a.groupId === existingAssignment.groupId)
					if (!currentAssignment) return true // Group was removed
					
					// Check if student IDs are different
					if (currentAssignment.studentIds.length !== existingAssignment.studentIds.length) return true
					
					// Check if any student IDs are different
					return currentAssignment.studentIds.some(id => !existingAssignment.studentIds.includes(id)) ||
						existingAssignment.studentIds.some(id => !currentAssignment.studentIds.includes(id))
				}) || assignments.some(currentAssignment => {
					// Check if there are any new groups that weren't in the existing assignments
					return !existingAssignmentsData.assignments.some(existingAssignment => 
						existingAssignment.groupId === currentAssignment.groupId
					)
				})

				if (hasChanges) {
					setPendingAssignments({ assignments, removedStudentIds: removedStudents.map(student => student.id) })
					setShowConfirmDialog(true)
					return
				}
			}

			// If no changes or no existing assignments, proceed with saving
			if (!selectedClassId) throw new Error('Class ID not available')
			const response = await fetch('/api/schedules/assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					classId: selectedClassId,
					assignments,
					removedStudentIds: removedStudents.map(student => student.id),
					weekday: scheduleWeekday,
					schoolYearId,
				}),
			})

			if (!response.ok) {
				throw new Error('Failed to store assignments')
			}

			// Navigate to the teachers page
			router.push(
				`/schedule/create/teachers?class=${encodeURIComponent(selectedClass)}&weekday=${scheduleWeekday}`
			)
		} catch (err) {
			console.error('Error saving assignments:', err)
			captureFrontendError(err, {
				location: 'schedule/create',
				type: 'save-assignments',
				extra: {
					selectedClass,
					numberOfGroups,
					assignments: pendingAssignments
				}
			})
			setError('Fehler beim Speichern der Zuweisungen.')
		}
	}

	async function handleConfirmUpdate() {
		if (!pendingAssignments || !selectedClassId || scheduleWeekday == null || !schoolYearId) return

		try {
			const response = await fetch('/api/schedules/assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					classId: selectedClassId,
					assignments: pendingAssignments.assignments,
					removedStudentIds: pendingAssignments.removedStudentIds,
					weekday: scheduleWeekday,
					schoolYearId,
				}),
			})

			if (!response.ok) {
				throw new Error('Failed to update assignments')
			}

			// Navigate to the teachers page
			router.push(
				`/schedule/create/teachers?class=${encodeURIComponent(selectedClass)}&weekday=${scheduleWeekday}`
			)
		} catch (err) {
			console.error('Error updating assignments:', err)
			captureFrontendError(err, {
				location: 'schedule/create',
				type: 'update-assignments',
				extra: {
					selectedClass,
					assignments: pendingAssignments
				}
			})
			setError('Fehler beim Aktualisieren der Zuweisungen.')
		} finally {
			setShowConfirmDialog(false)
			setPendingAssignments(null)
		}
	}

	/**
	 * Closes the assignment update confirmation dialog and discards any pending assignment changes.
	 */
	function handleCancelUpdate() {
		setShowConfirmDialog(false)
		setPendingAssignments(null)
	}

	/**
	 * Moves a student from their current group to the unassigned group.
	 *
	 * Updates the groups state by removing the specified student from their group and adding them to the unassigned group, maintaining alphabetical order by last name in the unassigned group.
	 *
	 * @param studentId - The ID of the student to move to the unassigned group.
	 */
	function handleStudentRemoval(studentId: number) {
		setGroups(currentGroups => {
			const newGroups = [...currentGroups]
			
			// Find the source group
			const sourceGroupIndex = newGroups.findIndex(group => 
				group.students.some(student => student.id === studentId)
			)
			
			if (sourceGroupIndex === -1) return currentGroups

			// Find the student
			const student = newGroups[sourceGroupIndex]!.students.find(s => s.id === studentId)
			if (!student) return currentGroups

			// Remove student from source group
			newGroups[sourceGroupIndex]!.students = newGroups[sourceGroupIndex]!.students.filter(
				s => s.id !== studentId
			)

			// Add student to unassigned group
			const unassignedGroupIndex = newGroups.findIndex(group => group.id === UNASSIGNED_GROUP_ID)
			if (unassignedGroupIndex !== -1) {
				newGroups[unassignedGroupIndex]!.students.push(student)
				// Sort students in the unassigned group by last name
				newGroups[unassignedGroupIndex]!.students.sort((a, b) => 
					a.lastName.localeCompare(b.lastName)
				)
			}

			return newGroups
		})
	}

	/**
	 * Sets the currently active student when a drag operation starts.
	 *
	 * Extracts the student ID from the drag event and updates the active student state if a matching student is found.
	 *
	 * @param event - The drag start event containing the active draggable item.
	 */
	function handleDragStart(event: DragStartEvent) {
		const { active } = event
		if (!active?.id) return
		
		// Extract the student ID from the prefixed string
		const studentId = Number(active.id.toString().replace('student-', ''))
		const student = students.find(s => s.id === studentId)
		if (student) {
			setActiveStudent(student)
		}
	}

	/**
	 * Handles the completion of a drag-and-drop action for a student, moving the student to a new group if allowed.
	 *
	 * Prevents moving students to the unassigned group via drag-and-drop and enforces the maximum group size constraint. If the target group is full, displays a dialog warning the user.
	 *
	 * @param event - The drag end event containing information about the dragged student and target group.
	 */
	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		
		if (!over?.id || !active?.id) return

		// Extract the IDs from the prefixed strings
		const studentId = Number(active.id.toString().replace('student-', ''))
		const targetGroupId = Number(over.id.toString().replace('group-', ''))

		// Don't allow moving to unassigned group if it's not the source
		if (targetGroupId === UNASSIGNED_GROUP_ID) {
			setActiveStudent(null)
			return
		}

		setGroups(currentGroups => {
			const newGroups = [...currentGroups]
			
			// Find the source group
			const sourceGroupIndex = newGroups.findIndex(group => 
				group.students.some(student => student.id === studentId)
			)
			
			if (sourceGroupIndex === -1) return currentGroups

			// Find the student
			const student = newGroups[sourceGroupIndex]!.students.find(s => s.id === studentId)
			if (!student) return currentGroups

			// Find the target group
			const targetGroupIndex = newGroups.findIndex(group => group.id === targetGroupId)
			if (targetGroupIndex === -1) return currentGroups

			// Check if adding the student would exceed the maximum group size
			if (newGroups[targetGroupIndex]!.students.length >= MAX_GROUP_SIZE) {
				setShowMaxSizeDialog(true)
				return currentGroups
			}

			// Remove student from source group
			newGroups[sourceGroupIndex]!.students = newGroups[sourceGroupIndex]!.students.filter(
				s => s.id !== studentId
			)

			// Add student to target group
			newGroups[targetGroupIndex]!.students.push(student)
			// Sort students in the target group by last name
			newGroups[targetGroupIndex]!.students.sort((a, b) => 
				a.lastName.localeCompare(b.lastName)
			)

			return newGroups
		})

		setActiveStudent(null)
	}

	function handleClassSelectOnEntry(value: string) {
		setSelectedClass(value)
		if (value) {
			router.replace(`/schedule/create?class=${encodeURIComponent(value)}`)
		} else {
			router.replace('/schedule/create')
		}
		setEntrySelectedWeekday(null)
	}

	function handleEntryContinue() {
		if (!selectedClass || entrySelectedWeekday == null) return
		router.push(
			`/schedule/create?class=${encodeURIComponent(selectedClass)}&weekday=${entrySelectedWeekday}`
		)
	}

	async function handleCombineClasses(e: React.FormEvent) {
		e.preventDefault()
		
		// Validate form
		if (!combineClasses.class1Id || !combineClasses.class2Id) {
			setError(t('bothClassesRequired'))
			return
		}

		if (combineClasses.class1Id === combineClasses.class2Id) {
			setError(t('selectDifferentClasses'))
			return
		}

		if (!combineClasses.combinedClassName.trim()) {
			setError(t('combinedClassNameRequired'))
			return
		}

		setCombiningClasses(true)
		setError(null)

		try {
			const response = await fetch('/api/classes/combine', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					class1Id: parseInt(combineClasses.class1Id),
					class2Id: parseInt(combineClasses.class2Id),
					combinedClassName: combineClasses.combinedClassName.trim()
				}),
			})

			if (!response.ok) {
				const errorPayload = await parseJsonSafe(response)
				throw new Error(getApiErrorMessage(errorPayload, 'Failed to combine classes'))
			}

			await response.json()
			
			// Reset form and close dialog
			setCombineClasses({
				class1Id: '',
				class2Id: '',
				combinedClassName: ''
			})
			setShowCombineClassesDialog(false)

			// Refresh classes list
			const url = schoolYearId != null ? `/api/classes?schoolYearId=${schoolYearId}` : '/api/classes'
			const classesRes = await fetch(url)
			if (classesRes.ok) {
				const classesPayload = await parseJsonSafe(classesRes)
				const classesData = unwrapData<Class[]>(classesPayload)
				setClasses(classesData)
			}



		} catch (err) {
			console.error('Error combining classes:', err)
			captureFrontendError(err, {
				location: 'schedule/create',
				type: 'combine-classes',
				extra: {
					combineClasses
				}
			})
			
			// Check if it's a "too many students" error
			const errorMessage = err instanceof Error ? err.message : String(err)
			if (errorMessage.includes('Cannot combine classes') && errorMessage.includes('students')) {
				setError(errorMessage)
			} else {
				setError(t('classesCombinedError'))
			}
		} finally {
			setCombiningClasses(false)
		}
	}

	return (
		<div className="container mx-auto p-4">
			<Card>
				<CardHeader>
					<CardTitle>
						{needsWeekdayPick ? t('selectClass') : t('studentsOfClass', { class: selectedClass })}
					</CardTitle>
					{!needsWeekdayPick && scheduleWeekday != null && (
						<p className="text-sm text-muted-foreground mt-1">
							{tCommon(`overview.weekdays.${WEEKDAY_LABEL_KEYS[scheduleWeekday - 1]}`)}
						</p>
					)}
				</CardHeader>
				<CardContent className="space-y-6">
					{loadingClasses && classes.length === 0 ? (
						<p>{t('loadingClasses')}</p>
					) : (
						<>
							<div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
								{needsWeekdayPick ? t('help.classSelection') : t('help.groupAssignment')}
							</div>
							{error && (
								<div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 text-sm">
									{error}
								</div>
							)}
							{needsWeekdayPick ? (
								<div className="space-y-6">
									<div>
										<Label htmlFor="class-select-entry" className="block mb-2 font-medium">
											{t('class')}
										</Label>
										<Select value={selectedClass} onValueChange={handleClassSelectOnEntry}>
											<SelectTrigger id="class-select-entry" className="w-full">
												<SelectValue placeholder={t('pleaseSelect')} />
											</SelectTrigger>
											<SelectContent>
												{classes.map((cls) => (
													<SelectItem key={cls.id} value={cls.name}>
														{cls.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									{schoolYearId == null && (
										<p className="text-sm text-muted-foreground">
											Bitte ein Schuljahr auswählen (Kopfzeile der Anwendung).
										</p>
									)}
									{selectedClass && schoolYearId != null && (
										<div className="space-y-4">
											<Label className="block font-medium">{t('selectWeekday')}</Label>
											{isLoadingPresence ? (
												<p className="text-sm text-muted-foreground">{t('loadingStudents')}</p>
											) : (
												<ul className="space-y-2" role="list">
													{[1, 2, 3, 4, 5].map((wd) => (
														<li key={wd}>
															<button
																type="button"
																onClick={() => setEntrySelectedWeekday(wd)}
																className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
																	entrySelectedWeekday === wd
																		? 'border-primary ring-2 ring-primary/30 bg-accent/30'
																		: 'border-border hover:bg-accent/50'
																}`}
															>
																{weekdayPresence?.[wd] ? (
																	<CheckCircle2
																		className="h-5 w-5 text-green-600 shrink-0"
																		aria-hidden
																	/>
																) : (
																	<Circle
																		className="h-5 w-5 text-muted-foreground shrink-0"
																		aria-hidden
																	/>
																)}
																<span className="font-medium">
																	{tCommon(`overview.weekdays.${WEEKDAY_LABEL_KEYS[wd - 1]}`)}
																</span>
															</button>
														</li>
													))}
												</ul>
											)}
											<div className="mt-8 flex justify-end gap-4">
												<Button
													type="button"
													onClick={handleEntryContinue}
													disabled={!selectedClass || entrySelectedWeekday == null}
													className="bg-primary text-primary-foreground hover:bg-primary/90"
												>
													{t('next')}
												</Button>
											</div>
										</div>
									)}
								</div>
							) : (
								<div className="space-y-6">
									<div className="flex flex-wrap gap-2">
										<Button
											type="button"
											onClick={() => setShowCombineClassesDialog(true)}
											variant="outline"
											className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
										>
											{t('combineClasses')}
										</Button>
									</div>
									{selectedClass && (
										<form
											onSubmit={async (e) => {
												e.preventDefault()
												await handleNext()
											}}
											className="space-y-6"
										>
											<div className="flex justify-between items-center mb-4 flex-wrap gap-4">
												<h2 className="text-lg font-semibold sr-only">{t('studentsOfClass', { class: selectedClass })}</h2>
												<div className="flex items-center gap-4">
													<div className="flex items-center gap-2">
														<label htmlFor="group-size" className="text-sm font-medium">
															{t('numberOfGroups')}:
														</label>
														<select
															id="group-size"
															value={numberOfGroups}
															onChange={handleGroupSizeChange}
															className="border rounded px-2 py-1"
														>
															<option value="2">2</option>
															<option value="3">3</option>
															<option value="4">4</option>
														</select>
													</div>
													<Button
														type="button"
														onClick={handleReset}
														variant="outline"
														className="text-sm"
													>
														{t('resetGroups')}
													</Button>
												</div>
											</div>
											{loading ? (
												<p>{t('loadingStudents')}</p>
											) : (
												<DndContext
													sensors={sensors}
													onDragStart={handleDragStart}
													onDragEnd={handleDragEnd}
												>
													<div
														className={`grid gap-6 ${
															numberOfGroups === 2
																? 'grid-cols-1 md:grid-cols-2 justify-items-center'
																: numberOfGroups === 3
																	? 'grid-cols-1 md:grid-cols-2 justify-items-center [&>*:nth-child(3)]:md:col-span-2 [&>*:nth-child(3)]:max-w-md [&>*:nth-child(3)]:mx-auto'
																	: 'grid-cols-1 md:grid-cols-2 justify-items-center'
														}`}
													>
														{groups
															.filter((g) => g.id !== UNASSIGNED_GROUP_ID)
															.sort((a, b) => a.id - b.id)
															.map((group) => (
																<GroupContainer key={group.id} group={group}>
																	<div className="space-y-2">
																		{group.students.map((student, index) => (
																			<StudentItem
																				key={student.id}
																				student={student}
																				index={index}
																				onRemove={handleStudentRemoval}
																				t={t}
																			/>
																		))}
																	</div>
																</GroupContainer>
															))}
														{groups.find((g) => g.id === UNASSIGNED_GROUP_ID)?.students.length ? (
															<div className="flex flex-col items-center gap-4">
																<GroupContainer
																	key={UNASSIGNED_GROUP_ID}
																	group={{
																		id: UNASSIGNED_GROUP_ID,
																		students:
																			groups.find((g) => g.id === UNASSIGNED_GROUP_ID)?.students ?? [],
																	}}
																>
																	<div className="space-y-2">
																		{(groups.find((g) => g.id === UNASSIGNED_GROUP_ID)?.students ?? []).map(
																			(student, index) => (
																				<StudentItem
																					key={student.id}
																					student={student}
																					index={index}
																					onRemove={handleStudentRemoval}
																					t={t}
																				/>
																			)
																		)}
																	</div>
																</GroupContainer>
															</div>
														) : null}
													</div>
													<DragOverlay>
														{activeStudent ? (
															<div className="text-sm p-2 bg-card border rounded shadow-lg">
																{`${activeStudent.lastName}, ${activeStudent.firstName}`}
															</div>
														) : null}
													</DragOverlay>
												</DndContext>
											)}
											<div className="mt-8 flex justify-end gap-4">
												<Button
													type="submit"
													disabled={!selectedClass}
													className="bg-primary text-primary-foreground hover:bg-primary/90"
												>
													{t('next')}
												</Button>
											</div>
										</form>
									)}
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>

			{/* Max Size Dialog */}
			<Dialog open={showMaxSizeDialog} onOpenChange={setShowMaxSizeDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('maxGroupSizeError')}</DialogTitle>
						<DialogDescription>
							{t('maxGroupSizeDescription')}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setShowMaxSizeDialog(false)}>
							{t('ok')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('updateAssignmentsTitle')}</DialogTitle>
						<DialogDescription>{updateAssignmentsMessage}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={handleCancelUpdate}>
							{t('cancel')}
						</Button>
						<Button onClick={handleConfirmUpdate}>
							{t('update')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Combine Classes Dialog */}
			<CombineClassesDialog
				open={showCombineClassesDialog}
				onOpenChange={setShowCombineClassesDialog}
				classes={classes}
				combineClasses={combineClasses}
				onCombineClassesChange={setCombineClasses}
				onSubmit={handleCombineClasses}
				combining={combiningClasses}
				t={t}
			/>
		</div>
	)
} 