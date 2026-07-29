import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  BookOpen,
  GraduationCap,
  MapPin,
  Sun,
  Sunset,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScheduleOverview } from '@/hooks/use-schedule-overview'
import { ScheduleOverview } from '@/components/schedule-overview'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { parse, isValid, isWithinInterval, addWeeks } from 'date-fns'
import type {
  ScheduleResponse,
  TeacherAssignmentResponse,
  ScheduleTerm,
  TurnSchedule,
  Group,
} from '@/types/types'

/**
 * Renders a schedule overview for the logged-in student with conditional weekday navigation tabs.
 *
 * Fetches the student's class and group, determines which weekdays have schedules, and displays
 * the schedule overview. Only shows weekday navigation tabs if there are multiple schedules,
 * and only displays tabs for weekdays that have schedules associated with them.
 *
 * @returns A React component showing the student's schedule overview with conditional weekday navigation and error alerts.
 */
export function StudentOverview() {
  const { data: session } = useSession()
  const { t } = useTranslation()
  const [studentClass, setStudentClass] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<number | null>(null)
  const [availableWeekdays, setAvailableWeekdays] = useState<number[]>([])
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch student's class and groupId
  useEffect(() => {
    const fetchStudentData = async () => {
      if (!session?.user?.name) return

      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/students/class?username=${session.user.name}`)
        if (!response.ok) {
          const errorData = (await response.json()) as { error?: string }
          setError(errorData.error ?? 'Failed to fetch student data')
          setLoading(false)
          return
        }

        const data = (await response.json()) as { class: string; groupId: number | null }
        setStudentClass(data.class)
        setGroupId(data.groupId)

        // Fetch all schedules for the class to determine available weekdays
        const schedulesResponse = await fetch(`/api/schedules?classId=${data.class}`)
        if (!schedulesResponse.ok) {
          setError('Failed to fetch schedules')
          setLoading(false)
          return
        }

        const schedules = (await schedulesResponse.json()) as ScheduleResponse[]

        if (schedules.length === 0) {
          setError('No schedules found for your class')
          setLoading(false)
          return
        }

        // Extract unique weekdays
        const weekdaySet = new Set<number>()

        schedules.forEach(schedule => {
          weekdaySet.add(schedule.selectedWeekday)
        })

        const weekdays = Array.from(weekdaySet).sort()
        setAvailableWeekdays(weekdays)

        // Set initial selected weekday (first available, or current day if available)
        const today = new Date().getDay()
        const initialWeekday = weekdays.includes(today) ? today : (weekdays[0] ?? null)
        setSelectedWeekday(initialWeekday)
      } catch (err) {
        console.error('Error fetching student data:', err)
        setError('Failed to load student information')
      } finally {
        setLoading(false)
      }
    }

    if (session?.user?.role === 'student') {
      void fetchStudentData()
    }
  }, [session?.user?.role, session?.user?.name])

  const handleTabChange = (value: string) => {
    const weekday = parseInt(value)
    if (!isNaN(weekday)) {
      setSelectedWeekday(weekday)
    }
  }

  const getWeekdayName = (weekday: number): string => {
    const weekdayNames: Record<number, string> = {
      1: t('overview.weekdays.monday'),
      2: t('overview.weekdays.tuesday'),
      3: t('overview.weekdays.wednesday'),
      4: t('overview.weekdays.thursday'),
      5: t('overview.weekdays.friday'),
    }
    return weekdayNames[weekday] ?? `Weekday ${weekday}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!studentClass || selectedWeekday === null) {
    return null
  }

  const scheduleContent =
    availableWeekdays.length === 1 && availableWeekdays[0] !== undefined ? (
      <ScheduleOverviewWrapper
        className={studentClass}
        weekday={availableWeekdays[0]}
        groupId={groupId}
      />
    ) : (
      <Tabs defaultValue={`${selectedWeekday}`} className="w-full" onValueChange={handleTabChange}>
        <TabsList
          className="grid w-full"
          style={{ gridTemplateColumns: `repeat(${availableWeekdays.length}, 1fr)` }}
        >
          {availableWeekdays.map(weekday => (
            <TabsTrigger key={weekday} value={`${weekday}`}>
              {getWeekdayName(weekday)}
            </TabsTrigger>
          ))}
        </TabsList>
        {availableWeekdays.map(weekday => (
          <TabsContent key={weekday} value={`${weekday}`} className="mt-4">
            <ScheduleOverviewWrapper className={studentClass} weekday={weekday} groupId={groupId} />
          </TabsContent>
        ))}
      </Tabs>
    )

  return <div className="w-full space-y-6">{scheduleContent}</div>
}

/**
 * Component that displays the student's current teacher assignments for AM and PM periods.
 * Uses the schedule overview data to determine which teacher is teaching the student's group.
 */
function StudentCurrentAssignments({
  amAssignments,
  pmAssignments,
  turns,
  groups,
  groupId,
}: {
  amAssignments: TeacherAssignmentResponse[]
  pmAssignments: TeacherAssignmentResponse[]
  turns: TurnSchedule
  groups: Group[]
  groupId: number | null
}) {
  const { t } = useTranslation()

  // Get current week/turn
  const currentDate = new Date()
  const scheduleData = turns as Record<string, ScheduleTerm> | undefined
  const currentWeek = scheduleData
    ? Object.entries(scheduleData).find(([_, data]) => {
        const termData = data as ScheduleTerm
        return termData.weeks.some(week => {
          const parsedDate = parse(week.date, 'dd.MM.yy', new Date())
          if (!isValid(parsedDate)) return false
          const weekEnd = addWeeks(parsedDate, 1)
          return isWithinInterval(currentDate, {
            start: parsedDate,
            end: weekEnd,
          })
        })
      })
    : null

  const turnKey = currentWeek ? currentWeek[0] : null

  // Find which teacher is teaching the student's group
  // Logic: rotate groups based on turn, then find which teacher index has the student's group
  const findTeacherForGroup = (
    assignments: TeacherAssignmentResponse[],
    studentGroupId: number,
  ): TeacherAssignmentResponse | null => {
    if (!studentGroupId || groups.length === 0) {
      // Fallback: direct groupId match
      return assignments.find(a => a.groupId === studentGroupId) ?? null
    }

    // Get unique teachers for this period (sorted by their base assignment order)
    const uniqueTeachers = assignments
      .filter(a => a.teacherId !== 0)
      .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx)
      .sort((a, b) => a.groupId - b.groupId) // Sort by groupId to match teacher order

    // Find which turn index we're in
    const turnKeys = scheduleData ? Object.keys(scheduleData) : []
    const turnIndex = turnKey ? turnKeys.indexOf(turnKey) : -1

    if (turnIndex >= 0) {
      // Rotate groups based on turn index (same logic as ScheduleOverview)
      const rotatedGroups = [...groups]
      for (let i = 0; i < turnIndex; i++) {
        const temp = rotatedGroups.shift()
        if (temp) rotatedGroups.push(temp)
      }

      // Find which teacher index has the student's group in the rotated array
      const teacherIndex = rotatedGroups.findIndex(g => g.id === studentGroupId)

      if (teacherIndex >= 0 && teacherIndex < uniqueTeachers.length) {
        const teacher = uniqueTeachers[teacherIndex]
        return teacher ?? null
      }
    }

    // Fallback: direct groupId match (no rotation or turn not found)
    return assignments.find(a => a.groupId === studentGroupId) ?? null
  }

  const amAssignment = findTeacherForGroup(amAssignments, groupId ?? 0)
  const pmAssignment = findTeacherForGroup(pmAssignments, groupId ?? 0)

  if (!amAssignment && !pmAssignment) {
    return null
  }

  const renderPeriod = (
    label: string,
    periodIcon: LucideIcon,
    assignment: TeacherAssignmentResponse | null,
  ) => {
    const PeriodIcon = periodIcon
    return (
      <div className="bg-muted/40 rounded-lg border p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="bg-background text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
            <PeriodIcon className="h-4 w-4" />
          </span>
          <p className="text-foreground text-sm font-semibold">{label}</p>
        </div>
        {assignment ? (
          <dl className="space-y-2.5">
            <AssignmentField
              icon={UserRound}
              label={t('overview.student.teacher')}
              value={[assignment.teacherFirstName, assignment.teacherLastName]
                .filter(Boolean)
                .join(' ')}
              strong
            />
            <AssignmentField
              icon={BookOpen}
              label={t('overview.student.subject')}
              value={assignment.subject}
            />
            <AssignmentField
              icon={GraduationCap}
              label={t('overview.student.learningContent')}
              value={assignment.learningContent}
            />
            <AssignmentField
              icon={MapPin}
              label={t('overview.student.room')}
              value={assignment.room}
            />
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm italic">
            {t('overview.student.noAssignment')}
          </p>
        )}
      </div>
    )
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-lg">{t('overview.student.currentAssignments')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {renderPeriod(t('overview.teacher.amGroup'), Sun, amAssignment)}
          {renderPeriod(t('overview.teacher.pmGroup'), Sunset, pmAssignment)}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * A single labelled fact inside a student's period card: muted icon + label on
 * one line, value beneath. Keeps the AM/PM cards scannable at a glance.
 */
function AssignmentField({
  icon: Icon,
  label,
  value,
  strong = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className={cn('text-sm', strong ? 'text-foreground font-semibold' : '')}>
          {value || '—'}
        </dd>
      </div>
    </div>
  )
}

/**
 * Wrapper component that fetches and displays schedule overview for a specific weekday.
 */
function ScheduleOverviewWrapper({
  className,
  weekday,
  groupId,
}: {
  className: string
  weekday: number
  groupId: number | null
}) {
  const {
    groups,
    amAssignments,
    pmAssignments,
    scheduleTimes,
    breakTimes,
    turns: defaultTurns,
    classHead,
    classLead,
    additionalInfo: defaultAdditionalInfo,
    loading: hookLoading,
    error: hookError,
  } = useScheduleOverview(className)

  // Fetch schedule data for the specific weekday
  const [turns, setTurns] = useState(defaultTurns)
  const [additionalInfo, setAdditionalInfo] = useState(defaultAdditionalInfo)
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [scheduleError, setScheduleError] = useState<string | null>(null)

  useEffect(() => {
    const fetchScheduleForWeekday = async () => {
      try {
        setScheduleLoading(true)
        setScheduleError(null)
        const response = await fetch(`/api/schedules?classId=${className}&weekday=${weekday}`)
        if (!response.ok) {
          setScheduleError('Failed to fetch schedule for this weekday')
          setScheduleLoading(false)
          return
        }
        const schedules = (await response.json()) as ScheduleResponse[]
        if (schedules.length > 0 && schedules[0]) {
          // Get the most recent schedule for this weekday
          const latestSchedule = schedules[0]
          setTurns((latestSchedule.scheduleData ?? {}) as typeof defaultTurns)
          setAdditionalInfo(latestSchedule.additionalInfo ?? '')
        } else {
          setScheduleError('No schedule found for this weekday')
        }
      } catch (err) {
        console.error('Error fetching schedule for weekday:', err)
        setScheduleError('Failed to load schedule')
      } finally {
        setScheduleLoading(false)
      }
    }

    void fetchScheduleForWeekday()
  }, [className, weekday, defaultTurns])

  if (hookLoading || scheduleLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    )
  }

  if (hookError || scheduleError) {
    return (
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{hookError ?? scheduleError ?? ''}</AlertDescription>
      </Alert>
    )
  }

  return (
    <>
      <StudentCurrentAssignments
        amAssignments={amAssignments}
        pmAssignments={pmAssignments}
        turns={turns}
        groups={groups}
        groupId={groupId}
      />
      <ScheduleOverview
        groups={groups}
        amAssignments={amAssignments}
        pmAssignments={pmAssignments}
        scheduleTimes={scheduleTimes}
        breakTimes={breakTimes}
        turns={turns}
        classHead={classHead}
        classLead={classLead}
        additionalInfo={additionalInfo}
        weekday={weekday}
        className={className}
        showExportButtons={false}
      />
    </>
  )
}
