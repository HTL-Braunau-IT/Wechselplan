import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { rotatedGroupIndex } from '@/lib/rotation'
import { useScheduleOverview } from '@/hooks/use-schedule-overview'
import { ScheduleOverview } from '@/components/schedule-overview'
import { StudentGradingCriteria } from '@/components/overviews/student-grading-criteria'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { parse, isValid, isWithinInterval, addWeeks } from 'date-fns'
import type { TeacherAssignmentResponse, ScheduleTerm, TurnSchedule, Group } from '@/types/types'

interface StudentPlan {
  weekday: number
  /** The class owning the plan — a combined class for a member of one. */
  className: string
  groupId: number | null
}

/**
 * The signed-in student's complete Wechselplan: one tab per planned weekday,
 * each rendering the same overview staff see on /schedules (groups, teachers,
 * times, rotation, Turnusse), plus the student's own current teacher per period.
 *
 * Plans come from `/api/students/class`, which names the class owning each day's
 * plan — for a member of a combined class that is the combined class, since
 * their own class has no plan of its own.
 */
export function StudentOverview() {
  const { data: session } = useSession()
  const { t } = useTranslation()
  const [plans, setPlans] = useState<StudentPlan[]>([])
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStudentData = async () => {
      if (!session?.user?.name) return

      try {
        setLoading(true)
        setError(null)

        const response = await fetch(
          `/api/students/class?username=${encodeURIComponent(session.user.name)}`,
        )
        if (!response.ok) {
          const errorData = (await response.json()) as { error?: string }
          setError(errorData.error ?? 'Failed to fetch student data')
          return
        }

        const data = (await response.json()) as { plans?: StudentPlan[] }
        const found = data.plans ?? []
        if (found.length === 0) {
          setError('No schedules found for your class')
          return
        }
        setPlans(found)

        // Open on today when it is a plan day, else the first one.
        const today = new Date().getDay()
        setSelectedWeekday(
          found.some(p => p.weekday === today) ? today : (found[0]?.weekday ?? null),
        )
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

  const selected = plans.find(p => p.weekday === selectedWeekday)
  if (!selected) return null

  return (
    <div className="w-full space-y-6">
      <StudentGradingCriteria />
      {plans.length > 1 && (
        <Tabs value={String(selected.weekday)} onValueChange={v => setSelectedWeekday(Number(v))}>
          <TabsList
            className="grid w-full"
            style={{ gridTemplateColumns: `repeat(${plans.length}, 1fr)` }}
          >
            {plans.map(plan => (
              <TabsTrigger key={plan.weekday} value={String(plan.weekday)}>
                {getWeekdayName(plan.weekday)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <StudentPlanView plan={selected} />
    </div>
  )
}

/**
 * Component that displays the student's current teacher assignments for AM and PM periods.
 * Uses the schedule overview data to determine which teacher is teaching the student's group.
 */
function StudentCurrentAssignments({
  amAssignments,
  pmAssignments,
  amTurns,
  pmTurns,
  groups,
  groupId,
}: {
  amAssignments: TeacherAssignmentResponse[]
  pmAssignments: TeacherAssignmentResponse[]
  amTurns: TurnSchedule
  pmTurns: TurnSchedule
  groups: Group[]
  groupId: number | null
}) {
  const { t } = useTranslation()

  // Index of the Turnus running this week within one lane's Turnusse, or -1.
  const currentTurnIndex = (turns: TurnSchedule): number => {
    const currentDate = new Date()
    return Object.values(turns as Record<string, ScheduleTerm>).findIndex(term =>
      term.weeks.some(week => {
        const parsedDate = parse(week.date, 'dd.MM.yy', new Date())
        if (!isValid(parsedDate)) return false
        return isWithinInterval(currentDate, { start: parsedDate, end: addWeeks(parsedDate, 1) })
      }),
    )
  }

  // Find which teacher is teaching the student's group
  // Logic: rotate groups based on turn, then find which teacher index has the student's group
  const findTeacherForGroup = (
    assignments: TeacherAssignmentResponse[],
    turns: TurnSchedule,
    studentGroupId: number,
  ): TeacherAssignmentResponse | null => {
    if (!studentGroupId || groups.length === 0) {
      // Fallback: direct groupId match
      return assignments.find(a => a.groupId === studentGroupId) ?? null
    }

    // Unique teachers in the order ScheduleOverview lists them.
    const uniqueTeachers = assignments
      .filter(a => a.teacherId !== 0)
      .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx)

    const turnIndex = currentTurnIndex(turns)
    if (turnIndex >= 0) {
      // The teacher whose row shows the student's group this Turnus in ScheduleOverview.
      const teacher = uniqueTeachers.find(
        (_, teacherIdx) =>
          groups[rotatedGroupIndex(teacherIdx, turnIndex, groups.length)]?.id === studentGroupId,
      )
      if (teacher) return teacher
    }

    // Fallback: direct groupId match (no rotation or turn not found)
    return assignments.find(a => a.groupId === studentGroupId) ?? null
  }

  const amAssignment = findTeacherForGroup(amAssignments, amTurns, groupId ?? 0)
  const pmAssignment = findTeacherForGroup(pmAssignments, pmTurns, groupId ?? 0)

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
 * One weekday's plan, read exactly as the staff /schedules page reads it — only
 * the roster comes from the student-scoped endpoint.
 */
function StudentPlanView({ plan }: { plan: StudentPlan }) {
  const overview = useScheduleOverview(plan.className, undefined, plan.weekday, {
    selfRoster: true,
  })

  if (overview.loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    )
  }

  if (overview.error) {
    return (
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{overview.error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <StudentCurrentAssignments
        amAssignments={overview.amAssignments}
        pmAssignments={overview.pmAssignments}
        amTurns={overview.amTurns}
        pmTurns={overview.pmTurns}
        groups={overview.groups}
        groupId={plan.groupId}
      />
      <ScheduleOverview
        groups={overview.groups}
        amAssignments={overview.amAssignments}
        pmAssignments={overview.pmAssignments}
        scheduleTimes={overview.scheduleTimes}
        breakTimes={overview.breakTimes}
        turns={overview.turns}
        amTurns={overview.amTurns}
        pmTurns={overview.pmTurns}
        classHead={overview.classHead}
        classLead={overview.classLead}
        additionalInfo={overview.additionalInfo}
        weekday={overview.weekday}
      />
    </div>
  )
}
