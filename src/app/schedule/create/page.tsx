'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useTranslation } from 'next-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { AlertCircle, ArrowRight, Combine, RotateCcw, UserPlus, Users } from 'lucide-react'
import { captureFrontendError } from '@/lib/frontend-error'
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning'
import { WizardFooter } from '@/components/schedule/wizard-footer'
import {
  UNASSIGNED_GROUP_ID,
  distributeStudentsEvenly,
  checkGroupSizes,
  ensureUnassignedGroup,
  adjustGroupCount,
  renumberGroups,
} from '@/lib/group-distribution'
import { StudentItem } from '@/components/schedule/student-item'
import { GroupContainer } from '@/components/schedule/group-container'
import { AddStudentDialog } from '@/components/schedule/add-student-dialog'
import { CombineClassesDialog } from '@/components/schedule/combine-classes-dialog'
import { TransferStudentDialog } from '@/components/schedule/transfer-student-dialog'
import { useClassDataByName } from '@/hooks/use-class-data'
import { useGroupAssignments } from '@/hooks/use-group-assignments'
import { useSchoolYear } from '@/contexts/school-year-context'

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

// Maximum size of a single (non-unassigned) group
const MAX_GROUP_SIZE = 12
// Maximum supported students (4 groups × 12 students)
const MAX_SUPPORTED_STUDENTS = 48

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
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true)
  // Fatal errors (class/student load failed, class too large) — these replace the
  // whole editor. `sizeError` is a live validation flag shown inline that blocks
  // "Next"; `actionError` holds non-fatal action failures shown inline. Keeping
  // them separate stops a transient validation message from wiping the editor.
  const [error, setError] = useState<string | null>(null)
  const [sizeError, setSizeError] = useState<boolean>(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [numberOfGroups, setNumberOfGroups] = useState<number>(2)
  const [groups, setGroups] = useState<Group[]>([
    {
      id: UNASSIGNED_GROUP_ID,
      students: [],
    },
  ])
  const [activeStudent, setActiveStudent] = useState<Student | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showMaxSizeDialog, setShowMaxSizeDialog] = useState(false)
  const [pendingAssignments, setPendingAssignments] = useState<{
    assignments: Assignment[]
    removedStudentIds: number[]
  } | null>(null)
  const [showAddStudentDialog, setShowAddStudentDialog] = useState(false)
  const [newStudent, setNewStudent] = useState({
    firstName: '',
    lastName: '',
    username: '',
  })
  const [showCombineClassesDialog, setShowCombineClassesDialog] = useState(false)
  const [combineClasses, setCombineClasses] = useState({
    class1Id: '',
    class2Id: '',
    combinedClassName: '',
  })
  const [combiningClasses, setCombiningClasses] = useState(false)
  const [isManualGroupChange, setIsManualGroupChange] = useState(false)
  const [showTransferDialog, setShowTransferDialog] = useState(false)
  const [transferTargetStudent, setTransferTargetStudent] = useState<Student | null>(null)
  const [transferring, setTransferring] = useState(false)
  // Unsaved in-step edits (group drag/reset/remove) — lost on reload before "Next".
  const [dirty, setDirty] = useState(false)
  const queryClient = useQueryClient()

  useUnsavedWarning(dirty)

  /**
   * Resets the group assignments to two groups, evenly distributing students by last name.
   *
   * If redistributing students would cause any group to exceed the maximum allowed size, displays a warning dialog instead of resetting.
   */
  function handleReset() {
    // Calculate appropriate number of groups based on student count
    const resetGroups = students.length > 36 ? 4 : students.length > 18 ? 3 : 2

    setNumberOfGroups(resetGroups)

    // Check if any group would exceed the maximum size
    const maxStudentsPerGroup = Math.ceil(students.length / resetGroups)
    if (maxStudentsPerGroup > MAX_GROUP_SIZE) {
      setShowMaxSizeDialog(true)
      return
    }

    const newGroups = distributeStudentsEvenly(students, resetGroups)
    setGroups(newGroups)
    setDirty(true)
  }

  // Add effect to automatically generate username
  useEffect(() => {
    if (newStudent.firstName && newStudent.lastName) {
      setNewStudent(prev => ({
        ...prev,
        username: `${newStudent.firstName.toLowerCase()}.${newStudent.lastName.toLowerCase()}`,
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
    }),
  )

  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id

  // Fetch classes using React Query (filtered by selected school year)
  const { data: classesData, isLoading: isLoadingClassesData } = useQuery<Class[]>({
    queryKey: ['classes', schoolYearId],
    queryFn: async () => {
      const url =
        schoolYearId != null ? `/api/classes?schoolYearId=${schoolYearId}` : '/api/classes'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch classes')
      return res.json() as Promise<Class[]>
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

  // Fetch students
  const { data: studentsData, isLoading: isLoadingStudents } = useQuery<Student[]>({
    queryKey: ['students', selectedClass],
    queryFn: async () => {
      if (!selectedClass) throw new Error('Class name is required')
      const res = await fetch(`/api/students?class=${selectedClass}`)
      if (!res.ok) throw new Error('Failed to fetch students')
      return res.json() as Promise<Student[]>
    },
    enabled: !!selectedClass,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch group assignments
  const { data: assignmentsData, isLoading: isLoadingAssignments } =
    useGroupAssignments(selectedClassId)

  // Update students when data is fetched
  useEffect(() => {
    if (studentsData) {
      setStudents(studentsData)
    }
  }, [studentsData])

  // Initialize groups when students and assignments are loaded
  useEffect(() => {
    if (!selectedClass || !selectedClassId || isLoadingStudents || isLoadingAssignments) {
      setLoading(isLoadingStudents || isLoadingAssignments)
      return
    }

    if (!studentsData) return

    setLoading(true)
    setIsManualGroupChange(false) // Reset manual change flag when loading new class
    setError(null) // Clear any fatal/action error from a previously selected class
    setActionError(null)

    try {
      // Calculate initial number of groups based on student count
      const initialGroups = studentsData.length > 36 ? 4 : studentsData.length > 18 ? 3 : 2
      setNumberOfGroups(initialGroups)

      // Check if class has too many students
      if (studentsData.length > MAX_SUPPORTED_STUDENTS) {
        setError(
          t('tooManyStudentsError', { max: MAX_SUPPORTED_STUDENTS, count: studentsData.length }),
        )
        setLoading(false)
        return
      }

      if (assignmentsData?.assignments && assignmentsData.assignments.length > 0) {
        // Only count real groups: exclude unassigned (groupId 0) and empty rows
        const regularAssignments = assignmentsData.assignments.filter(
          a => a.groupId !== UNASSIGNED_GROUP_ID && a.studentIds.length > 0,
        )
        const existingGroups: Group[] = [
          // Always include unassigned group first
          {
            id: UNASSIGNED_GROUP_ID,
            students: (assignmentsData.unassignedStudents || []).map(s => ({
              ...s,
              class: selectedClass || '',
            })),
          },
          // Then add only regular (non-empty, non-unassigned) groups
          ...regularAssignments.map(assignment => ({
            id: assignment.groupId,
            students: assignment.studentIds
              .map(id => studentsData.find(s => s.id === id))
              .filter((s): s is Student => s !== undefined),
          })),
        ]
        setGroups(existingGroups)
        setNumberOfGroups(regularAssignments.length)
      } else {
        // Otherwise, create default groups with even distribution
        const newGroups = distributeStudentsEvenly(studentsData, initialGroups)
        setGroups(newGroups)
      }
    } catch (err) {
      console.error('Error processing students and assignments:', err)
      captureFrontendError(err, {
        location: 'schedule/create',
        type: 'process-students-assignments',
        extra: {
          selectedClass,
        },
      })
      setError('Fehler beim Laden der Schüler und Zuweisungen.')
    } finally {
      setLoading(false)
    }
  }, [
    selectedClass,
    selectedClassId,
    studentsData,
    assignmentsData,
    isLoadingStudents,
    isLoadingAssignments,
    t,
  ])

  // Apply a manual change to the number of groups in a single pass: grow/shrink
  // (redistributing students) and then renumber to 1..n. Consolidates what used to
  // be two separate, order-sensitive effects. Both steps are pure + unit-tested in
  // src/lib/__tests__/group-distribution.test.ts.
  useEffect(() => {
    if (students.length === 0) return
    if (!isManualGroupChange) return

    setGroups(current =>
      renumberGroups(adjustGroupCount(current, numberOfGroups, MAX_GROUP_SIZE), numberOfGroups),
    )
    setIsManualGroupChange(false)
  }, [numberOfGroups, students, isManualGroupChange])

  // Ensure the unassigned group is always present.
  useEffect(() => {
    setGroups(ensureUnassignedGroup)
  }, [])

  // Track group-size validity (shown inline, blocks "Next" — see sizeError).
  useEffect(() => {
    setSizeError(!checkGroupSizes(groups, MAX_GROUP_SIZE))
  }, [groups])

  /**
   * Updates the number of groups based on the selected value from the group size dropdown.
   *
   * @param value - The selected number of groups as a string.
   */
  function handleGroupSizeChange(value: string) {
    setNumberOfGroups(Number(value))
    setIsManualGroupChange(true)
    setDirty(true)
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
        studentIds: group.students.map(student => student.id),
      }))

      // Check if there are existing assignments
      if (!selectedClassId) throw new Error('Class ID not available')
      const existingAssignmentsRes = await fetch(
        `/api/schedules/assignments?classId=${selectedClassId}`,
      )
      if (!existingAssignmentsRes.ok) throw new Error('Failed to fetch existing assignments')
      const existingAssignmentsData = (await existingAssignmentsRes.json()) as AssignmentsResponse

      // Only show confirmation if there are existing assignments
      if (existingAssignmentsData.assignments && existingAssignmentsData.assignments.length > 0) {
        // Check if the assignments are different from what's currently on screen
        const hasChanges =
          existingAssignmentsData.assignments.some(existingAssignment => {
            const currentAssignment = assignments.find(
              a => a.groupId === existingAssignment.groupId,
            )
            if (!currentAssignment) return true // Group was removed

            // Check if student IDs are different
            if (currentAssignment.studentIds.length !== existingAssignment.studentIds.length)
              return true

            // Check if any student IDs are different
            return (
              currentAssignment.studentIds.some(
                id => !existingAssignment.studentIds.includes(id),
              ) ||
              existingAssignment.studentIds.some(id => !currentAssignment.studentIds.includes(id))
            )
          }) ||
          assignments.some(currentAssignment => {
            // Check if there are any new groups that weren't in the existing assignments
            return !existingAssignmentsData.assignments.some(
              existingAssignment => existingAssignment.groupId === currentAssignment.groupId,
            )
          })

        if (hasChanges) {
          setPendingAssignments({
            assignments,
            removedStudentIds: removedStudents.map(student => student.id),
          })
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
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to store assignments')
      }

      // Navigate to the teachers page
      setDirty(false)
      router.push(`/schedule/create/teachers?class=${selectedClass}`)
    } catch (err) {
      console.error('Error saving assignments:', err)
      captureFrontendError(err, {
        location: 'schedule/create',
        type: 'save-assignments',
        extra: {
          selectedClass,
          numberOfGroups,
          assignments: pendingAssignments,
        },
      })
      setActionError('Fehler beim Speichern der Zuweisungen.')
    }
  }

  async function handleConfirmUpdate() {
    if (!pendingAssignments || !selectedClassId) return

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
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update assignments')
      }

      // Navigate to the teachers page
      setDirty(false)
      router.push(`/schedule/create/teachers?class=${selectedClass}`)
    } catch (err) {
      console.error('Error updating assignments:', err)
      captureFrontendError(err, {
        location: 'schedule/create',
        type: 'update-assignments',
        extra: {
          selectedClass,
          assignments: pendingAssignments,
        },
      })
      setActionError('Fehler beim Aktualisieren der Zuweisungen.')
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
        group.students.some(student => student.id === studentId),
      )

      if (sourceGroupIndex === -1) return currentGroups

      // Find the student
      const student = newGroups[sourceGroupIndex]!.students.find(s => s.id === studentId)
      if (!student) return currentGroups

      // Remove student from source group
      newGroups[sourceGroupIndex]!.students = newGroups[sourceGroupIndex]!.students.filter(
        s => s.id !== studentId,
      )

      // Add student to unassigned group
      const unassignedGroupIndex = newGroups.findIndex(group => group.id === UNASSIGNED_GROUP_ID)
      if (unassignedGroupIndex !== -1) {
        newGroups[unassignedGroupIndex]!.students.push(student)
        // Sort students in the unassigned group by last name
        newGroups[unassignedGroupIndex]!.students.sort((a, b) =>
          a.lastName.localeCompare(b.lastName),
        )
      }

      return newGroups
    })
    setDirty(true)
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
        group.students.some(student => student.id === studentId),
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
        s => s.id !== studentId,
      )

      // Add student to target group
      newGroups[targetGroupIndex]!.students.push(student)
      // Sort students in the target group by last name
      newGroups[targetGroupIndex]!.students.sort((a, b) => a.lastName.localeCompare(b.lastName))

      return newGroups
    })

    setActiveStudent(null)
    setDirty(true)
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
          className: selectedClass,
        }),
      })

      if (!response.ok) {
        const error = (await response.json()) as { error?: string }
        throw new Error(error.error ?? 'Failed to create student')
      }

      // Reset form and close dialog
      setNewStudent({
        firstName: '',
        lastName: '',
        username: '',
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
          newStudent,
        },
      })
      setActionError('Fehler beim Hinzufügen des Schülers.')
    }
  }

  async function handleCombineClasses(e: React.FormEvent) {
    e.preventDefault()

    // Validate form
    if (!combineClasses.class1Id || !combineClasses.class2Id) {
      setActionError(t('bothClassesRequired'))
      return
    }

    if (combineClasses.class1Id === combineClasses.class2Id) {
      setActionError(t('selectDifferentClasses'))
      return
    }

    if (!combineClasses.combinedClassName.trim()) {
      setActionError(t('combinedClassNameRequired'))
      return
    }

    setCombiningClasses(true)
    setActionError(null)

    try {
      const response = await fetch('/api/classes/combine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          class1Id: parseInt(combineClasses.class1Id),
          class2Id: parseInt(combineClasses.class2Id),
          combinedClassName: combineClasses.combinedClassName.trim(),
        }),
      })

      if (!response.ok) {
        const error = (await response.json()) as { error?: string; details?: unknown }
        throw new Error(error.error ?? 'Failed to combine classes')
      }

      await response.json()

      // Reset form and close dialog
      setCombineClasses({
        class1Id: '',
        class2Id: '',
        combinedClassName: '',
      })
      setShowCombineClassesDialog(false)

      // Refresh classes list
      const url =
        schoolYearId != null ? `/api/classes?schoolYearId=${schoolYearId}` : '/api/classes'
      const classesRes = await fetch(url)
      if (classesRes.ok) {
        const classesData = (await classesRes.json()) as Class[]
        setClasses(classesData)
      }
    } catch (err) {
      console.error('Error combining classes:', err)
      captureFrontendError(err, {
        location: 'schedule/create',
        type: 'combine-classes',
        extra: {
          combineClasses,
        },
      })

      // Check if it's a "too many students" error
      const errorMessage = err instanceof Error ? err.message : String(err)
      if (errorMessage.includes('Cannot combine classes') && errorMessage.includes('students')) {
        setActionError(errorMessage)
      } else {
        setActionError(t('classesCombinedError'))
      }
    } finally {
      setCombiningClasses(false)
    }
  }

  function handleOpenTransferDialog(student: Student) {
    setTransferTargetStudent(student)
    setShowTransferDialog(true)
  }

  async function handleTransferStudent(targetClassId: number, targetGroupId: number | null) {
    if (!transferTargetStudent) return
    if (!schoolYearId) {
      setActionError(t('transferError'))
      throw new Error('School year not selected')
    }

    setTransferring(true)
    try {
      const response = await fetch(`/api/students/${transferTargetStudent.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetClassId,
          targetGroupId,
          schoolYearId,
        }),
      })

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Failed to transfer student')
      }

      const transferredId = transferTargetStudent.id

      setStudents(prev => prev.filter(s => s.id !== transferredId))
      setGroups(prev =>
        prev.map(group => ({
          ...group,
          students: group.students.filter(s => s.id !== transferredId),
        })),
      )

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['students', selectedClass] }),
        queryClient.invalidateQueries({ queryKey: ['group-assignments', selectedClassId] }),
        queryClient.invalidateQueries({ queryKey: ['group-assignments', targetClassId] }),
      ])

      setShowTransferDialog(false)
      setTransferTargetStudent(null)
    } catch (err) {
      console.error('Error transferring student:', err)
      captureFrontendError(err, {
        location: 'schedule/create',
        type: 'transfer-student',
        extra: {
          studentId: transferTargetStudent.id,
          targetClassId,
          targetGroupId,
          schoolYearId,
        },
      })
      setActionError(err instanceof Error ? err.message : t('transferError'))
      throw err
    } finally {
      setTransferring(false)
    }
  }

  return (
    <PageContainer size="wide">
      <div className="space-y-6">
        <PageHeader
          icon={Users}
          title={t('selectClass')}
          actions={
            <>
              <Button onClick={() => setShowAddStudentDialog(true)}>
                <UserPlus className="h-4 w-4" />
                {t('addStudent')}
              </Button>
              <Button variant="outline" onClick={() => setShowCombineClassesDialog(true)}>
                <Combine className="h-4 w-4" />
                {t('combineClasses')}
              </Button>
            </>
          }
        />

        {loadingClasses && !selectedClass ? (
          <div className="text-muted-foreground flex items-center gap-3 py-8">
            <Spinner size="sm" />
            <span>{t('loadingClasses')}</span>
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>{t('class')}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* The primary "next" action lives in the wizard footer below for
                    consistent button placement across all creation steps. */}
                <div className="space-y-2">
                  <Label htmlFor="class-select">{t('class')}</Label>
                  <Select value={selectedClass} onValueChange={setSelectedClass} required>
                    <SelectTrigger id="class-select" className="w-full">
                      <SelectValue placeholder={t('pleaseSelect')} />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map(cls => (
                        <SelectItem key={cls.id} value={cls.name}>
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {selectedClass && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-xl font-semibold">
                    {t('studentsOfClass', { class: selectedClass })}
                  </h2>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="group-size" className="text-sm font-medium">
                        {t('numberOfGroups')}:
                      </Label>
                      <Select value={String(numberOfGroups)} onValueChange={handleGroupSizeChange}>
                        <SelectTrigger id="group-size" className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleReset} variant="outline" size="sm">
                      <RotateCcw className="h-4 w-4" />
                      {t('resetGroups')}
                    </Button>
                  </div>
                </div>
                {sizeError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="break-words">
                      {t('maxGroupSizeError')}
                    </AlertDescription>
                  </Alert>
                )}
                {actionError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="break-words">{actionError}</AlertDescription>
                  </Alert>
                )}
                {loading ? (
                  <div className="text-muted-foreground flex items-center gap-3 py-8">
                    <Spinner size="sm" />
                    <span>{t('loadingStudents')}</span>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    <div
                      className={`grid gap-6 ${
                        numberOfGroups === 2
                          ? 'grid-cols-1 justify-items-center md:grid-cols-2'
                          : numberOfGroups === 3
                            ? 'grid-cols-1 justify-items-center md:grid-cols-2 [&>*:nth-child(3)]:mx-auto [&>*:nth-child(3)]:max-w-md [&>*:nth-child(3)]:md:col-span-2'
                            : 'grid-cols-1 justify-items-center md:grid-cols-2'
                      }`}
                    >
                      {/* Regular groups first */}
                      {groups
                        .filter(g => g.id !== UNASSIGNED_GROUP_ID)
                        .sort((a, b) => a.id - b.id)
                        .map(group => (
                          <GroupContainer key={group.id} group={group}>
                            <div className="space-y-2">
                              {group.students.map((student, index) => (
                                <StudentItem
                                  key={student.id}
                                  student={student}
                                  index={index}
                                  onRemove={handleStudentRemoval}
                                  onTransfer={handleOpenTransferDialog}
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
                              students:
                                groups.find(g => g.id === UNASSIGNED_GROUP_ID)?.students ?? [],
                            }}
                          >
                            <div className="space-y-2">
                              {(groups.find(g => g.id === UNASSIGNED_GROUP_ID)?.students ?? []).map(
                                (student, index) => (
                                  <StudentItem
                                    key={student.id}
                                    student={student}
                                    index={index}
                                    onRemove={handleStudentRemoval}
                                    t={t}
                                  />
                                ),
                              )}
                            </div>
                          </GroupContainer>
                        </div>
                      ) : null}
                    </div>
                    <DragOverlay>
                      {activeStudent ? (
                        <div className="bg-card rounded border p-2 text-sm shadow-lg">
                          {`${activeStudent.lastName}, ${activeStudent.firstName}`}
                        </div>
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                )}
              </div>
            )}

            <WizardFooter>
              <Button
                disabled={!selectedClass || sizeError}
                onClick={() => void handleNext()}
              >
                {t('next')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </WizardFooter>
          </div>
        )}
      </div>

      {/* Max Size Dialog */}
      <Dialog open={showMaxSizeDialog} onOpenChange={setShowMaxSizeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('maxGroupSizeError')}</DialogTitle>
            <DialogDescription>{t('maxGroupSizeDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowMaxSizeDialog(false)}>{t('ok')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={showConfirmDialog}
        onOpenChange={open => {
          if (!open) handleCancelUpdate()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('updateAssignmentsTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('updateAssignmentsMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelUpdate}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUpdate}>{t('update')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Student Dialog */}
      <AddStudentDialog
        open={showAddStudentDialog}
        onOpenChange={setShowAddStudentDialog}
        newStudent={newStudent}
        onStudentChange={setNewStudent}
        onAdd={handleAddStudent}
        t={t}
      />

      {/* Transfer Student Dialog */}
      <TransferStudentDialog
        open={showTransferDialog}
        onOpenChange={open => {
          setShowTransferDialog(open)
          if (!open) setTransferTargetStudent(null)
        }}
        student={transferTargetStudent}
        currentClassId={selectedClassId}
        classes={classes}
        onConfirm={handleTransferStudent}
        transferring={transferring}
        t={t}
      />

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
    </PageContainer>
  )
}
