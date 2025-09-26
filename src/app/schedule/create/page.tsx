'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useTranslation } from 'next-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { captureFrontendError } from '@/lib/frontend-error'


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

// Add constant for maximum group size
const MAX_GROUP_SIZE = 12
// Add constant for maximum supported students (4 groups × 12 students)
const MAX_SUPPORTED_STUDENTS = 48

/**
 * Renders a draggable student item with the student's name and index, and provides a button to remove the student from the group.
 *
 * @param student - The student to display.
 * @param index - The position of the student in the list.
 * @param onRemove - Callback invoked with the student's ID when the remove button is clicked.
 */
function StudentItem({ student, index, onRemove, t }: { student: Student, index: number, onRemove: (studentId: number) => void, t: (key: string) => string }) {
	const { attributes, listeners, setNodeRef, transform } = useDraggable({
		id: `student-${student.id}`
	})

	const style = transform ? {
		transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
	} : undefined

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...listeners}
			{...attributes}
			className="text-sm p-3 bg-card border border-border rounded-lg cursor-move hover:bg-accent transition-all duration-200 flex items-start justify-between group min-h-[60px]"
		>
			<div className="flex-1 min-w-0 pr-2">
				<div className="flex items-center mb-1">
					<span className="text-muted-foreground mr-2 text-xs font-medium">{index + 1}.</span>
					<span className="font-medium truncate">{`${student.lastName}, ${student.firstName}`}</span>
				</div>
				{student.originalClass && (
					<div className="text-xs text-muted-foreground ml-4 bg-muted/50 px-2 py-1 rounded-md inline-block">
						{t('originallyFrom')}: {student.originalClass}
					</div>
				)}
			</div>
			<button
				onClick={(e) => {
					e.stopPropagation()
					onRemove(student.id)
				}}
				className="text-destructive hover:text-destructive/80 opacity-0 group-hover:opacity-100 transition-opacity"
				title="Remove student"
			>
				<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
				</svg>
			</button>
		</div>
	)
}

/**
 * Renders a droppable container for a group, displaying its title and containing student items.
 *
 * Highlights the container when a draggable item is hovered over it. Shows "Unassigned" for the unassigned group or "Group X" for other groups.
 *
 * @param group - The group to display, including its ID.
 * @param children - The student items or other elements to render inside the group container.
 */
function GroupContainer({ group, children }: { group: Group, children: React.ReactNode }) {
	const { t } = useTranslation('schedule')
	const { setNodeRef, isOver } = useDroppable({
		id: `group-${group.id}`
	})

	return (
		<div 
			ref={setNodeRef}
			className={`border border-border rounded-lg p-4 w-[320px] transition-colors bg-card min-h-[200px] ${
				isOver ? 'bg-accent/50 border-accent' : ''
			}`}
		>
			<h3 className="font-semibold mb-3 text-foreground text-center pb-2 border-b border-border/50">
				{group.id === UNASSIGNED_GROUP_ID ? t('unassigned') : `${t('group')} ${group.id}`}
			</h3>
			<div className="space-y-2">
				{children}
			</div>
		</div>
	)
}

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
 * Enables teachers to select a class, view and manage its students, create groups, assign students to groups, add or remove students, and save group assignments. Integrates with backend APIs for data retrieval and persistence, enforces maximum group size constraints, and prompts for confirmation when updating existing assignments.
 *
 * @returns The React component for the class scheduling and group assignment interface.
 *
 * @remark The unassigned group (ID 0) is always present and preserved across group changes. Students cannot be moved into the unassigned group via drag-and-drop, but can be moved there using the remove action. If a group assignment would exceed the maximum group size, a warning dialog is shown and the action is blocked. When existing assignments are detected and changes are made, a confirmation dialog is displayed before updating assignments.
 */
export default function ScheduleClassSelectPage() {
	const router = useRouter()
	const { t } = useTranslation('schedule')
	const searchParams = useSearchParams()

	const [classes, setClasses] = useState<Class[]>([])
	const [selectedClass, setSelectedClass] = useState<string>(searchParams.get('class') ?? '')
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
	const [showAddStudentDialog, setShowAddStudentDialog] = useState(false)
	const [newStudent, setNewStudent] = useState({
		firstName: '',
		lastName: '',
		username: ''
	})
	const [showCombineClassesDialog, setShowCombineClassesDialog] = useState(false)
	const [combineClasses, setCombineClasses] = useState({
		class1Id: '',
		class2Id: '',
		combinedClassName: ''
	})
	const [combiningClasses, setCombiningClasses] = useState(false)
	const [isManualGroupChange, setIsManualGroupChange] = useState(false)

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

	// Add effect to automatically generate username
	useEffect(() => {
		if (newStudent.firstName && newStudent.lastName) {
			setNewStudent(prev => ({
				...prev,
				username: `${newStudent.firstName.toLowerCase()}.${newStudent.lastName.toLowerCase()}`
			}))
		}
	}, [newStudent.firstName, newStudent.lastName])

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

	useEffect(() => {
		async function fetchClasses() {
			try {
				const res = await fetch('/api/classes')
				if (!res.ok) throw new Error('Failed to fetch classes')
				const data = await res.json() as Class[]
				setClasses(data)
			} catch (err) {
				console.error('Error fetching classes:', err)
				captureFrontendError(err, {
					location: 'schedule/create',
					type: 'fetch-classes'
				})
				setError('Fehler beim Laden der Klassen.')
			} finally {
				setLoadingClasses(false)
			}
		}
		void fetchClasses()
	}, [])

	useEffect(() => {
		/**
		 * Fetches students and their group assignments for the selected class, initializing groups accordingly.
		 *
		 * If existing assignments are found, reconstructs groups based on those assignments; otherwise, creates default groups by evenly distributing students sorted by last name. Sets the number of groups based on student count, defaulting to 2 or 3. Handles loading and error states.
		 *
		 * @remark Throws an error if a student ID in assignments does not match any fetched student.
		 */
		async function fetchStudents() {
			if (!selectedClass) return
			
			setLoading(true)
			setIsManualGroupChange(false) // Reset manual change flag when loading new class
			try {
				// First fetch all students
				const studentsRes = await fetch(`/api/students?class=${selectedClass}`)
				if (!studentsRes.ok) throw new Error('Failed to fetch students')
				const studentsData = await studentsRes.json() as Student[]
				setStudents(studentsData)

				// Calculate initial number of groups based on student count
				const initialGroups = studentsData.length > 36 ? 4 : 
					studentsData.length > 18 ? 3 : 2
				setNumberOfGroups(initialGroups)

				// Check if class has too many students
				if (studentsData.length > MAX_SUPPORTED_STUDENTS) {
					setError(t('tooManyStudentsError', { max: MAX_SUPPORTED_STUDENTS, count: studentsData.length }))
					return
				}

				// Then fetch existing assignments
				const assignmentsRes = await fetch(`/api/schedule/assignments?class=${selectedClass}`)
				if (!assignmentsRes.ok) throw new Error('Failed to fetch assignments')
				const assignmentsData = await assignmentsRes.json() as AssignmentsResponse

				if (assignmentsData.assignments && assignmentsData.assignments.length > 0) {
					// If we have existing assignments, use them
					const existingGroups: Group[] = [
						// Always include unassigned group first
						{
							id: UNASSIGNED_GROUP_ID,
							students: assignmentsData.unassignedStudents || []
						},
						// Then add regular groups
						...assignmentsData.assignments.map(assignment => ({
							id: assignment.groupId,
							students: assignment.studentIds.map(id => {
								const student = studentsData.find(s => s.id === id)
								if (!student) throw new Error(`Student with id ${id} not found`)
								return student
							})
						}))
					]
					setGroups(existingGroups)
					setNumberOfGroups(existingGroups.length - 1) // Subtract 1 for unassigned group
					hasExistingAssignmentsRef.current = true
				} else {
					// Otherwise, create default groups with even distribution
					const newGroups = distributeStudentsEvenly(studentsData, initialGroups)
					setGroups(newGroups)
					hasExistingAssignmentsRef.current = false
				}
			} catch (err) {
				console.error('Error fetching students and assignments:', err)
				captureFrontendError(err, {
					location: 'schedule/create',
					type: 'fetch-students-assignments',
					extra: {
						selectedClass
					}
				})
				setError('Fehler beim Laden der Schüler und Zuweisungen.')
			} finally {
				setLoading(false)
			}
		}
		void fetchStudents()
	}, [selectedClass])

	useEffect(() => {
		if (students.length === 0) return

		// Redistribute if we don't have existing assignments OR if it's a manual group change
		if (!hasExistingAssignmentsRef.current || isManualGroupChange) {
			// For new groups or manual changes, distribute all students evenly using the new function
			const newGroups = distributeStudentsEvenly(students, numberOfGroups)
			setGroups(newGroups)
			// Reset the manual change flag after redistribution
			if (isManualGroupChange) {
				setIsManualGroupChange(false)
			}
		}
		// If we have existing assignments and it's not a manual change, don't modify them
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

				return [
					unassignedGroup!,
					...regularGroups.map((group, index) => ({
						...group,
						id: index + 1
					}))
				]
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
			const existingAssignmentsRes = await fetch(`/api/schedule/assignments?class=${selectedClass}`)
			if (!existingAssignmentsRes.ok) throw new Error('Failed to fetch existing assignments')
			const existingAssignmentsData = await existingAssignmentsRes.json() as AssignmentsResponse

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
			const response = await fetch('/api/schedule/assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					class: selectedClass,
					assignments,
					removedStudentIds: removedStudents.map(student => student.id),
					updateExisting: true // Always set this to true to ensure new groups are properly initialized
				}),
			})

			if (!response.ok) {
				throw new Error('Failed to store assignments')
			}

			// Navigate to the teachers page
			router.push(`/schedule/create/teachers?class=${selectedClass}`)
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
		if (!pendingAssignments) return

		try {
			const response = await fetch('/api/schedule/assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					class: selectedClass,
					assignments: pendingAssignments.assignments,
					removedStudentIds: pendingAssignments.removedStudentIds,
					updateExisting: true // Always set this to true to ensure new groups are properly initialized
				}),
			})

			if (!response.ok) {
				throw new Error('Failed to update assignments')
			}

			// Navigate to the teachers page
			router.push(`/schedule/create/teachers?class=${selectedClass}`)
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

	async function handleAddStudent(e: React.FormEvent) {
		e.preventDefault() // Prevent form submission
		if (!selectedClass) return

		try {
			// Create the new student
			const response = await fetch('/api/students', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					...newStudent,
					className: selectedClass
				}),
			})

			if (!response.ok) {
				const error = await response.json() as { error?: string }
				throw new Error(error.error ?? 'Failed to create student')
			}

			// Reset form and close dialog
			setNewStudent({
				firstName: '',
				lastName: '',
				username: ''
			})
			setShowAddStudentDialog(false)

			// Reload the page with the class parameter
			router.push(`/schedule/create?class=${selectedClass}`)
		} catch (err) {
			console.error('Error adding student:', err)
			captureFrontendError(err, {
				location: 'schedule/create',
				type: 'add-student',
				extra: {
					selectedClass,
					newStudent
				}
			})
			setError('Fehler beim Hinzufügen des Schülers.')
		}
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
				const error = await response.json() as { error?: string, details?: unknown }
				throw new Error(error.error ?? 'Failed to combine classes')
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
			const classesRes = await fetch('/api/classes')
			if (classesRes.ok) {
				const classesData = await classesRes.json() as Class[]
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
					<CardTitle>{t('selectClass')}</CardTitle>
				</CardHeader>
				<CardContent>
					{loadingClasses && !selectedClass ? (
						<p>{t('loadingClasses')}</p>
					) : error ? (
						<p className="text-destructive">{error}</p>
					) : (
						<div className="space-y-6">
							<form onSubmit={async e => { 
								e.preventDefault()
								await handleNext()
							}} className="mb-8">
								<div className="space-y-4">
									<div>
										<Label htmlFor="class-select" className="block mb-2 font-medium">{t('class')}</Label>
										<Select
											value={selectedClass}
											onValueChange={setSelectedClass}
											required
										>
											<SelectTrigger id="class-select" className="w-full">
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
									<div className="flex gap-2">
										<Button
											type="submit"
											disabled={!selectedClass}
											className="bg-primary text-primary-foreground hover:bg-primary/90"
										>
											{t('next')}
										</Button>
									</div>
								</div>
							</form>
							<div className="flex gap-2 mb-8">
								<Button
									onClick={() => setShowAddStudentDialog(true)}
									className="bg-primary text-primary-foreground hover:bg-primary/90"
								>
									{t('addStudent')}
								</Button>
								<Button
									onClick={() => setShowCombineClassesDialog(true)}
									variant="outline"
									className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
								>
									{t('combineClasses')}
								</Button>
							</div>

							{selectedClass && (
								<div>
									<div className="flex justify-between items-center mb-4">
										<h2 className="text-xl font-semibold">{t('studentsOfClass', { class: selectedClass })}</h2>
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
													{students.length > 12 && (
														<option value="3">3</option>
													)}
													{students.length > 18 && (
														<option value="4">4</option>
													)}
												</select>
											</div>
											<Button
												onClick={handleReset}
												variant="outline"
												className="text-sm"
											>
												{t('resetGroups')}
											</Button>
										</div>
									</div>
									{error && (
										<div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
											<div className="flex items-start space-x-2">
												<svg className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
													<path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
												</svg>
												<div className="text-sm leading-relaxed break-words">
													{error}
												</div>
											</div>
										</div>
									)}
									{loading ? (
										<p>{t('loadingStudents')}</p>
									) : (
										<DndContext
											sensors={sensors}
											onDragStart={handleDragStart}
											onDragEnd={handleDragEnd}
										>
											<div className={`grid gap-6 ${
												numberOfGroups === 2 
													? 'grid-cols-1 md:grid-cols-2 justify-items-center' 
													: numberOfGroups === 3 
														? 'grid-cols-1 md:grid-cols-2 justify-items-center [&>*:nth-child(3)]:md:col-span-2 [&>*:nth-child(3)]:max-w-md [&>*:nth-child(3)]:mx-auto' 
														: 'grid-cols-1 md:grid-cols-2 justify-items-center'
											}`}>
												{/* Regular groups first */}
												{groups.filter(g => g.id !== UNASSIGNED_GROUP_ID).sort((a, b) => a.id - b.id).map((group) => (
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
												{/* Unassigned group last, only if it has students */}
												{groups.find(g => g.id === UNASSIGNED_GROUP_ID)?.students.length ? (
													<div className="flex flex-col items-center gap-4">
														<GroupContainer 
															key={UNASSIGNED_GROUP_ID} 
															group={{
																id: UNASSIGNED_GROUP_ID,
																students: groups.find(g => g.id === UNASSIGNED_GROUP_ID)?.students ?? []
															}}
														>
															<div className="space-y-2">
																{(groups.find(g => g.id === UNASSIGNED_GROUP_ID)?.students ?? []).map((student, index) => (
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
								</div>
							)}
						</div>
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

			{/* Confirmation Dialog */}
			{showConfirmDialog && (
				<div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center">
					<div className="bg-card p-6 rounded-lg max-w-md shadow-xl">
						<h2 className="text-xl font-bold mb-4">{t('updateAssignmentsTitle')}</h2>
						<p className="mb-6">{t('updateAssignmentsMessage')}</p>
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

			{/* Add Student Dialog */}
			<Dialog open={showAddStudentDialog} onOpenChange={setShowAddStudentDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('addStudentTitle')}</DialogTitle>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-4 items-center gap-4">
							<Label htmlFor="firstName" className="text-right">
								{t('firstName')}
							</Label>
							<Input
								id="firstName"
								value={newStudent.firstName}
								onChange={(e) => setNewStudent(prev => ({ ...prev, firstName: e.target.value }))}
								className="col-span-3"
							/>
						</div>
						<div className="grid grid-cols-4 items-center gap-4">
							<Label htmlFor="lastName" className="text-right">
								{t('lastName')}
							</Label>
							<Input
								id="lastName"
								value={newStudent.lastName}
								onChange={(e) => setNewStudent(prev => ({ ...prev, lastName: e.target.value }))}
								className="col-span-3"
							/>
						</div>
						<div className="grid grid-cols-4 items-center gap-4">
							<Label htmlFor="username" className="text-right">
								{t('username')}
							</Label>
							<Input
								id="username"
								value={newStudent.username}
								onChange={(e) => setNewStudent(prev => ({ ...prev, username: e.target.value }))}
								className="col-span-3"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowAddStudentDialog(false)}>
							{t('cancel')}
						</Button>
						<Button onClick={handleAddStudent}>
							{t('add')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Combine Classes Dialog */}
			<Dialog open={showCombineClassesDialog} onOpenChange={setShowCombineClassesDialog}>
				<DialogContent className="max-w-md mx-auto w-[95vw] sm:w-full">
					<DialogHeader className="space-y-3">
						<DialogTitle className="text-xl font-semibold">{t('combineClasses')}</DialogTitle>
						<DialogDescription className="text-sm text-muted-foreground leading-relaxed">
							{t('combineClassesDescription')}
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleCombineClasses} className="space-y-6">
						<div className="space-y-5">
							<div className="space-y-2">
								<Label htmlFor="class1" className="text-sm font-medium text-foreground">
									{t('selectFirstClass')}
								</Label>
								<Select
									value={combineClasses.class1Id}
									onValueChange={(value) => setCombineClasses(prev => ({ ...prev, class1Id: value }))}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder={t('pleaseSelect')} />
									</SelectTrigger>
									<SelectContent>
										{classes.map((cls) => (
											<SelectItem key={cls.id} value={cls.id.toString()}>
												{cls.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="class2" className="text-sm font-medium text-foreground">
									{t('selectSecondClass')}
								</Label>
								<Select
									value={combineClasses.class2Id}
									onValueChange={(value) => setCombineClasses(prev => ({ ...prev, class2Id: value }))}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder={t('pleaseSelect')} />
									</SelectTrigger>
									<SelectContent>
										{classes.map((cls) => (
											<SelectItem key={cls.id} value={cls.id.toString()}>
												{cls.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="combinedClassName" className="text-sm font-medium text-foreground">
									{t('combinedClassName')}
								</Label>
								<Input
									id="combinedClassName"
									value={combineClasses.combinedClassName}
									onChange={(e) => setCombineClasses(prev => ({ ...prev, combinedClassName: e.target.value }))}
									placeholder={t('combinedClassNamePlaceholder')}
									className="w-full"
								/>
							</div>
						</div>
						<DialogFooter className="flex flex-col sm:flex-row gap-3 sm:justify-end">
							<Button 
								type="button" 
								variant="outline" 
								onClick={() => setShowCombineClassesDialog(false)}
								disabled={combiningClasses}
								className="w-full sm:w-auto"
							>
								{t('cancel')}
							</Button>
							<Button 
								type="submit" 
								disabled={combiningClasses}
								className="w-full sm:w-auto"
							>
								{combiningClasses ? t('combiningClasses') : t('createCombinedClass')}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	)
} 