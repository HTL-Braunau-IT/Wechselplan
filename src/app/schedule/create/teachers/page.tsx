'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'next-i18next'
import { useCachedData } from '@/hooks/use-cached-data'
import { useClassDataByName } from '@/hooks/use-class-data'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Copy,
  Sunrise,
  Sunset,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { captureFrontendError } from '@/lib/frontend-error'
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning'
import { WizardFooter } from '@/components/schedule/wizard-footer'
import {
  PeriodAssignments,
  type TeacherAssignment,
} from '@/components/schedule/period-assignments'
import { useSchoolYear } from '@/contexts/school-year-context'

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

const WEEKDAY_VALUES = [1, 2, 3, 4, 5]

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
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const selectedClass = searchParams.get('class')
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null)

  const {
    rooms,
    subjects,
    learningContents,
    teachers,
    isLoading: isLoadingCachedData,
  } = useCachedData()
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
  // Unsaved in-step edits (teacher/subject/room entries) — lost on reload before "Next".
  const [dirty, setDirty] = useState(false)

  useUnsavedWarning(dirty)

  // Resolve className to classId when selectedClass changes
  const { data: classData } = useClassDataByName(selectedClass ?? null)

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
          roomId: 0,
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
        const groupsData = (await groupsRes.json()) as AssignmentsResponse
        setGroups(
          groupsData.assignments.map(assignment => ({
            id: assignment.groupId,
            students: assignment.students,
          })),
        )

        // Fetch existing teacher assignments for selected school year
        const teacherAssignmentsUrl =
          schoolYearId != null
            ? `/api/schedules/teacher-assignments?classId=${selectedClassId}&schoolYearId=${schoolYearId}`
            : `/api/schedules/teacher-assignments?classId=${selectedClassId}`
        const teacherAssignmentsRes = await fetch(teacherAssignmentsUrl)
        if (teacherAssignmentsRes.ok) {
          const teacherAssignmentsData =
            (await teacherAssignmentsRes.json()) as TeacherAssignmentsResponse
          const hasExistingAmAssignments = teacherAssignmentsData.amAssignments.some(
            a => a.teacherId !== 0,
          )
          const hasExistingPmAssignments = teacherAssignmentsData.pmAssignments.some(
            a => a.teacherId !== 0,
          )

          // Set the weekday from the response
          setSelectedWeekday(teacherAssignmentsData.selectedWeekday ?? 1)

          // Initialize base assignments for all groups
          const initialAssignments: TeacherAssignment[] = groupsData.assignments.map(
            assignment => ({
              groupId: assignment.groupId,
              teacherId: 0,
              subjectId: 0,
              learningContentId: 0,
              roomId: 0,
            }),
          )

          // Map string values back to IDs
          const mapAssignmentsToIds = (assignments: TeacherAssignmentResponse[]) =>
            assignments.map(assignment => {
              const subject = subjects.find(s => s.name === assignment.subject)
              const learningContent = learningContents.find(
                lc => lc.name === assignment.learningContent,
              )
              const room = rooms.find(r => r.name === assignment.room)

              if (!subject || !learningContent || !room) {
                console.warn('Missing cached data for assignment mapping:', {
                  subject: assignment.subject,
                  learningContent: assignment.learningContent,
                  room: assignment.room,
                })
              }

              return {
                groupId: assignment.groupId,
                teacherId: assignment.teacherId,
                subjectId: subject?.id ?? 0,
                learningContentId: learningContent?.id ?? 0,
                roomId: room?.id ?? 0,
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
          const initialAssignments: TeacherAssignment[] = groupsData.assignments.map(
            assignment => ({
              groupId: assignment.groupId,
              teacherId: 0,
              subjectId: 0,
              learningContentId: 0,
              roomId: 0,
            }),
          )
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
            selectedClass,
          },
        })
        setError(t('loadDataFailed'))
      } finally {
        setLoading(false)
      }
    }
    void fetchData()
  }, [
    selectedClass,
    selectedClassId,
    schoolYearId,
    isLoadingCachedData,
    subjects,
    learningContents,
    rooms,
  ])

  function handleAssignmentChange(
    period: 'am' | 'pm',
    groupId: number,
    field: keyof TeacherAssignment,
    value: string | number,
  ) {
    setDirty(true)
    const setAssignments = period === 'am' ? setAmAssignments : setPmAssignments
    setAssignments(current => {
      const existingAssignment = current.find(a => a.groupId === groupId)
      if (existingAssignment) {
        return current.map(assignment =>
          assignment.groupId === groupId ? { ...assignment, [field]: value } : assignment,
        )
      } else {
        // Create new assignment with all fields initialized to 0
        const newAssignment: TeacherAssignment = {
          groupId,
          teacherId: 0,
          subjectId: 0,
          learningContentId: 0,
          roomId: 0,
          [field]: value, // Set the changed field
        }
        return [...current, newAssignment]
      }
    })
  }

  function handleStringFieldChange(
    period: 'am' | 'pm',
    groupId: number,
    field: 'subject' | 'learningContent' | 'room',
    value: string,
  ) {
    setDirty(true)
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
                [customField]: selectedOption ? undefined : value,
              }
            : assignment,
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
          [customField]: selectedOption ? undefined : value,
        }
        return [...current, newAssignment]
      }
    })
  }

  function handleClearRow(period: 'am' | 'pm', groupId: number) {
    setDirty(true)
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
              customRoom: undefined,
            }
          : assignment,
      )
    })
  }

  async function handleNext() {
    try {
      // Keep all assignments that have any field filled in
      const validAmAssignments = amAssignments.filter(
        a =>
          a.teacherId !== 0 ||
          a.subjectId !== 0 ||
          a.learningContentId !== 0 ||
          a.roomId !== 0 ||
          (a.customSubject ?? a.customLearningContent ?? a.customRoom),
      )
      const validPmAssignments = pmAssignments.filter(
        a =>
          a.teacherId !== 0 ||
          a.subjectId !== 0 ||
          a.learningContentId !== 0 ||
          a.roomId !== 0 ||
          (a.customSubject ?? a.customLearningContent ?? a.customRoom),
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
            const hasLearningContent =
              assignment.learningContentId !== 0 || assignment.customLearningContent
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
            const hasLearningContent =
              assignment.learningContentId !== 0 || assignment.customLearningContent
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
      const mapAssignments = (assignments: TeacherAssignment[]) =>
        assignments.map(assignment => {
          const subject =
            assignment.customSubject ??
            subjects.find(s => s.id === assignment.subjectId)?.name ??
            ''
          const learningContent =
            assignment.customLearningContent ??
            learningContents.find(lc => lc.id === assignment.learningContentId)?.name ??
            ''
          const room =
            assignment.customRoom ?? rooms.find(r => r.id === assignment.roomId)?.name ?? ''

          return {
            groupId: assignment.groupId,
            teacherId: assignment.teacherId,
            subject,
            learningContent,
            room,
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
          ...(schoolYearId != null && { schoolYearId }),
          amAssignments: mapAssignments(validAmAssignments),
          pmAssignments: mapAssignments(validPmAssignments),
          updateExisting: true,
          selectedWeekday: selectedWeekday ?? 1,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as ApiError
        if (response.status === 409 && errorData.error === 'EXISTING_ASSIGNMENTS') {
          setPendingAssignments({
            amAssignments: validAmAssignments,
            pmAssignments: validPmAssignments,
          })
          setShowConfirmDialog(true)
          return
        }
        throw new Error(errorData.message ?? 'Failed to save teacher assignments')
      }

      // Navigate to the rotation page with both class and weekday parameters
      setDirty(false)
      router.push(
        `/schedule/create/rotation?class=${selectedClass}&weekday=${selectedWeekday ?? 1}`,
      )
    } catch (err) {
      console.error('Error saving assignments:', err)
      captureFrontendError(err, {
        location: 'schedule/create/teachers',
        type: 'save-assignments',
        extra: {
          selectedClass,
          assignments: {
            am: amAssignments,
            pm: pmAssignments,
          },
        },
      })
      setError(t('saveFailed'))
    }
  }

  async function handleConfirmUpdate() {
    if (!pendingAssignments || !selectedClassId) return

    try {
      // Map the assignments to include string values for subject, learningContent, and room
      const mapAssignments = (assignments: TeacherAssignment[]) =>
        assignments.map(assignment => {
          const subject =
            assignment.customSubject ??
            subjects.find(s => s.id === assignment.subjectId)?.name ??
            ''
          const learningContent =
            assignment.customLearningContent ??
            learningContents.find(lc => lc.id === assignment.learningContentId)?.name ??
            ''
          const room =
            assignment.customRoom ?? rooms.find(r => r.id === assignment.roomId)?.name ?? ''

          return {
            groupId: assignment.groupId,
            teacherId: assignment.teacherId,
            subject,
            learningContent,
            room,
          }
        })

      const response = await fetch('/api/schedules/teacher-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: selectedClassId,
          ...(schoolYearId != null && { schoolYearId }),
          amAssignments: mapAssignments(pendingAssignments.amAssignments),
          pmAssignments: mapAssignments(pendingAssignments.pmAssignments),
          updateExisting: true,
          selectedWeekday: selectedWeekday ?? 1,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update teacher assignments')
      }

      setShowConfirmDialog(false)
      setPendingAssignments(null)
      setDirty(false)
      router.push(
        `/schedule/create/rotation?class=${selectedClass}&weekday=${selectedWeekday ?? 1}`,
      )
    } catch (err) {
      console.error('Error updating assignments:', err)
      captureFrontendError(err, {
        location: 'schedule/create/teachers',
        type: 'update-assignments',
        extra: {
          selectedClass,
          assignments: {
            am: amAssignments,
            pm: pmAssignments,
          },
        },
      })
      setError(t('saveFailed'))
    }
  }

  function handleCancelUpdate() {
    setShowConfirmDialog(false)
    setPendingAssignments(null)
  }

  function handleCopyAmToPm() {
    setDirty(true)
    setPmAssignments(amAssignments.map(assignment => ({ ...assignment })))
  }

  if (isLoadingCachedData || loading)
    return (
      <PageContainer size="wide">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    )
  if (error)
    return (
      <PageContainer size="wide">
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      </PageContainer>
    )
  if (!selectedClass)
    return (
      <PageContainer size="wide">
        <EmptyState icon={Users} title={t('noClassSelected')} />
      </PageContainer>
    )

  return (
    <PageContainer size="wide">
      <div className="space-y-6">
        <PageHeader icon={Users} title={`${t('teacherAssignment')} - ${selectedClass}`} />

        {error && (
          <Alert variant="destructive">
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        )}

        {hasExistingAssignments && (
          <Alert variant="warning">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>{t('existingAssignmentsWarning')}</AlertDescription>
          </Alert>
        )}

        <div className="max-w-xs space-y-2">
          <Label htmlFor="weekday">{t('rotationDay')}</Label>
          <Select
            value={selectedWeekday?.toString() ?? ''}
            onValueChange={value => {
              setSelectedWeekday(parseInt(value))
              setDirty(true)
            }}
          >
            <SelectTrigger id="weekday" className="w-full">
              <SelectValue placeholder={t('selectWeekday')} />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAY_VALUES.map(value => (
                <SelectItem key={value} value={value.toString()}>
                  {t(`weekdays.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <PeriodAssignments
          period="am"
          title={t('morningAssignments')}
          icon={Sunrise}
          groups={groups}
          assignments={amAssignments}
          teachers={teachers}
          subjects={subjects}
          learningContents={learningContents}
          rooms={rooms}
          onAssignmentChange={handleAssignmentChange}
          onStringFieldChange={handleStringFieldChange}
          onClearRow={handleClearRow}
        />

        <PeriodAssignments
          period="pm"
          title={t('afternoonAssignments')}
          icon={Sunset}
          headerAction={
            <Button variant="outline" size="sm" onClick={handleCopyAmToPm}>
              <Copy className="h-4 w-4" />
              {t('copyFromAm')}
            </Button>
          }
          groups={groups}
          assignments={pmAssignments}
          teachers={teachers}
          subjects={subjects}
          learningContents={learningContents}
          rooms={rooms}
          onAssignmentChange={handleAssignmentChange}
          onStringFieldChange={handleStringFieldChange}
          onClearRow={handleClearRow}
        />

        <WizardFooter
          back={
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              {t('back')}
            </Button>
          }
        >
          <Button onClick={handleNext} disabled={loading}>
            {loading ? t('saving') : t('next')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </WizardFooter>
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={showConfirmDialog}
        onOpenChange={open => {
          if (!open) handleCancelUpdate()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('updateAssignmentsTitle')}</DialogTitle>
            <DialogDescription>{t('existingAssignmentsWarning')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelUpdate}>
              {t('cancel')}
            </Button>
            <Button onClick={handleConfirmUpdate}>{t('update')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('validationErrorsTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {validationErrors.am.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <Sunrise className="text-muted-foreground h-4 w-4" />
                  {t('morningAssignments')}
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {validationErrors.am.map(error => (
                    <li key={error.groupId}>
                      {t('group')} {error.groupId}:{' '}
                      {error.missingFields.map(field => t(field)).join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {validationErrors.pm.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <Sunset className="text-muted-foreground h-4 w-4" />
                  {t('afternoonAssignments')}
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {validationErrors.pm.map(error => (
                    <li key={error.groupId}>
                      {t('group')} {error.groupId}:{' '}
                      {error.missingFields.map(field => t(field)).join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowErrorDialog(false)}>{t('ok')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
