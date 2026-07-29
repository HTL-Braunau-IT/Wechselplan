import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import type {
  TeacherScheduleData,
  NormalizedTurn,
  BreakTime,
  ScheduleTime,
  Assignment,
} from '@/types/types'
import { parse, isValid, isWithinInterval, addWeeks } from 'date-fns'
import { useTranslation } from 'react-i18next'
import {
  CalendarClock,
  CalendarDays,
  CalendarX2,
  Clock,
  Coffee,
  Info,
  ListChecks,
  MapPin,
  School,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react'
import { StudentPhoto } from '@/components/student-photo'
import { cn } from '@/lib/utils'

/**
 * Compact icon + label + value tile used for the headline facts of an
 * assignment (group, weeks remaining, times, room). The `accent` variant lifts
 * the single most important fact — the teacher's current group — above the rest.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        accent ? 'border-primary/30 bg-primary/5' : 'bg-muted/40',
      )}
    >
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', accent && 'text-primary')}>
        {value}
      </p>
    </div>
  )
}

/**
 * Renders a weekly schedule overview for the logged-in teacher with weekday navigation tabs.
 *
 * Fetches and displays the teacher's assignments, class and term details, group information, remaining weeks, additional info, and lists of students for each group. The schedule updates dynamically based on the selected weekday and the current user's session, with error handling and dark mode support.
 *
 * @returns A React component showing the teacher's schedule overview with internationalized weekday navigation and error alerts.
 */
export function TeacherOverview() {
  const { data: session } = useSession()
  const { t } = useTranslation()
  const [scheduleData, setScheduleData] = useState<TeacherScheduleData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const today = new Date().getDay()

  const fetchData = async (weekday: number) => {
    if (!session?.user?.name) {
      setLoading(false)
      return
    }
    setScheduleData(null)
    setError(null)
    setLoading(true)
    try {
      const response = await fetch(
        `/api/schedules/data?teacher=${session.user.name}&weekday=${weekday}`,
      )
      if (!response.ok) {
        setError(t('overview.teacher.noSchedule'))
        return
      }
      const data = await response.json()

      // Check if we have any schedules
      if (
        !data.schedules ||
        data.schedules.length === 0 ||
        data.schedules.every((s: TeacherScheduleData['schedules'][0]) => s.length === 0)
      ) {
        setError(t('overview.teacher.noSchedule'))
        return
      }

      setScheduleData(data as TeacherScheduleData)
    } catch {
      setError(t('overview.teacher.noSchedule'))
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = (value: string) => {
    const weekday = parseInt(value)
    if (weekday < 6 && weekday > 0) {
      setScheduleData(null)
      setError(null)
      void fetchData(weekday)
    }
  }

  useEffect(() => {
    if (session?.user?.role === 'teacher') {
      const weekday = today === 0 || today === 6 ? 1 : today // Default to Monday if weekend
      // Clear schedule data before initial fetch
      setScheduleData(null)
      setError(null)
      void fetchData(weekday)
    }
  }, [session?.user?.role, today])

  const renderScheduleInfo = () => {
    if (!scheduleData?.schedules) return null
    const currentDate = new Date()
    const classAssignments = scheduleData.classAssignments ?? scheduleData.assignments

    // Get all assignments for the teacher
    const assignments = scheduleData.assignments
      .map(assignment => {
        const classInfo = scheduleData.classdata?.find(c => c.id === assignment.classId)
        return {
          ...assignment,
          className: classInfo?.name ?? `Class ${assignment.classId}`,
          classHead: classInfo?.classHead ?? '—',
          classLead: classInfo?.classLead ?? '—',
        }
      })
      .sort((a, b) => {
        // Sort AM before PM
        if (a.period === 'AM' && b.period === 'PM') return -1
        if (a.period === 'PM' && b.period === 'AM') return 1
        return 0
      })

    const getTurnsForClass = (classId: number): NormalizedTurn[] | undefined => {
      const classSchedule = scheduleData.schedules.find(schedules =>
        schedules.some(s => Number(s.classId) === classId),
      )
      return classSchedule?.[0]?.turns
    }

    type CurrentWeekResult = { turnIndex: number; turn: NormalizedTurn } | null

    const getCurrentWeek = (turns: NormalizedTurn[] | undefined): CurrentWeekResult => {
      if (!turns || turns.length === 0) return null
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i]
        if (!turn) continue
        const inThisTurn = turn.weeks.some(week => {
          const parsedDate = parse(week.date, 'dd.MM.yy', new Date())
          if (!isValid(parsedDate)) return false
          const weekEnd = addWeeks(parsedDate, 1)
          return isWithinInterval(currentDate, { start: parsedDate, end: weekEnd })
        })
        if (inThisTurn) return { turnIndex: i, turn }
      }
      return null
    }

    const getRemainingWeeks = (turns: NormalizedTurn[] | undefined): number => {
      const currentWeek = getCurrentWeek(turns)
      if (!currentWeek) return 0
      return currentWeek.turn.weeks.filter(week => {
        const parsedDate = parse(week.date, 'dd.MM.yy', new Date())
        return isValid(parsedDate) && parsedDate > currentDate
      }).length
    }

    const rotateArray = <T,>(arr: T[], n: number): T[] => {
      const rotated = [...arr]
      for (let i = 0; i < n; i++) {
        const temp = rotated.shift()
        if (temp !== undefined) rotated.push(temp)
      }
      return rotated
    }

    const getCurrentTurnIndex = (turns: NormalizedTurn[] | undefined): number => {
      const currentWeek = getCurrentWeek(turns)
      return currentWeek?.turnIndex ?? 0
    }

    const getActualGroupForAssignment = (assignment: Assignment): number | null => {
      const turns = getTurnsForClass(assignment.classId)
      if (!turns) return assignment.groupId ?? null

      const currentWeek = getCurrentWeek(turns)
      if (currentWeek && scheduleData.teacherRotation?.length) {
        const turnName = currentWeek.turn.name
        const rotation = scheduleData.teacherRotation.find(
          (r: { teacherId: number | string; classId: number; period: string; turnId: string }) =>
            Number(r.teacherId) === Number(assignment.teacherId) &&
            r.classId === assignment.classId &&
            r.period === assignment.period &&
            r.turnId === turnName,
        )
        if (rotation) return (rotation as { groupId: number }).groupId
      }

      const classStudents = scheduleData.students.find(students =>
        students.some(student => student.classId === assignment.classId),
      )
      if (!classStudents) return assignment.groupId ?? null

      const groupIds = [
        ...new Set(
          classStudents
            .filter(s => s.classId === assignment.classId && s.groupId)
            .map(s => s.groupId as number),
        ),
      ].sort((a, b) => a - b)

      if (groupIds.length === 0) return assignment.groupId ?? null

      const periodAssignments = classAssignments.filter(
        a => a.classId === assignment.classId && a.period === assignment.period,
      )
      const uniqueTeachers = periodAssignments
        .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx)
        .sort((a, b) => a.teacherId - b.teacherId)

      const teacherIndex = uniqueTeachers.findIndex(t => t.teacherId === assignment.teacherId)
      if (teacherIndex === -1) return assignment.groupId ?? null

      const turnIndex = getCurrentTurnIndex(turns)
      const rotatedGroups = rotateArray(groupIds, turnIndex)
      return rotatedGroups[teacherIndex] ?? assignment.groupId ?? null
    }

    const getTeacherDisplayName = (assignment: Assignment): string => {
      const firstName = assignment.teacherFirstName?.trim()
      const lastName = assignment.teacherLastName?.trim()
      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      return fullName || t('overview.teacher.unknownTeacher')
    }

    const getOtherGroupAssignments = (
      assignment: (typeof assignments)[0],
      currentGroupId: number | null,
    ) => {
      return classAssignments
        .filter(
          candidate =>
            candidate.classId === assignment.classId && candidate.period === assignment.period,
        )
        .map(candidate => ({
          ...candidate,
          actualGroupId: getActualGroupForAssignment(candidate),
        }))
        .filter(
          candidate =>
            candidate.actualGroupId != null && candidate.actualGroupId !== currentGroupId,
        )
        .sort((a, b) => (a.actualGroupId ?? 0) - (b.actualGroupId ?? 0))
    }

    const getStudentsForGroup = (groupId: number | undefined, classId: number | undefined) => {
      if (!groupId || !classId) return []
      // Find the array of students for this class
      const classStudents = scheduleData.students.find(students =>
        students.some(student => student.classId === classId),
      )
      return (
        classStudents?.filter(
          student => student.groupId === groupId && student.classId === classId,
        ) ?? []
      )
    }

    const getScheduleTimes = (classId: number, period: string): ScheduleTime | undefined => {
      const classSchedule = scheduleData.schedules.find(schedules =>
        schedules.some(s => Number(s.classId) === classId),
      )
      return classSchedule?.[0]?.scheduleTimes?.find((time: ScheduleTime) => time.period === period)
    }

    const getBreakTimes = (classId: number, period: string): BreakTime[] => {
      const classSchedule = scheduleData.schedules.find(schedules =>
        schedules.some(s => Number(s.classId) === classId),
      )
      const schedule = classSchedule?.[0]
      if (!schedule?.breakTimes) return []
      return schedule.breakTimes.filter(
        (time: BreakTime) => time.period === period || time.period === 'LUNCH',
      )
    }

    return (
      <div className="space-y-6">
        {assignments.map(assignment => {
          const turns = getTurnsForClass(assignment.classId)
          const currentWeek = getCurrentWeek(turns)
          const currentTerm = currentWeek ? currentWeek.turn.name : t('overview.teacher.noSchedule')
          const remainingWeeks = getRemainingWeeks(turns)
          const actualGroupId = getActualGroupForAssignment(assignment)

          const scheduleTime = getScheduleTimes(assignment.classId, assignment.period)
          const breakTimes = getBreakTimes(assignment.classId, assignment.period)
          const otherGroups = getOtherGroupAssignments(assignment, actualGroupId)
          const additionalInfo = scheduleData.schedules
            .find(sList => sList.some(s => Number(s.classId) === assignment.classId))
            ?.at(0)?.additionalInfo
          const trimmedInfo = additionalInfo?.trim() ?? ''
          const hasAdditionalInfo = trimmedInfo !== '' && trimmedInfo !== '—'

          const students = getStudentsForGroup(actualGroupId ?? undefined, assignment.classId).sort(
            (a, b) => a.lastName.localeCompare(b.lastName, 'de'),
          )

          return (
            <Card key={assignment.id} className="overflow-hidden p-0">
              {/* Header: class identity + quick action */}
              <div className="bg-muted/30 flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                    <School className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-xl font-semibold tracking-tight">
                        {assignment.className}
                      </h3>
                      <Badge variant="secondary" className="shrink-0">
                        {assignment.period}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-sm">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{currentTerm}</span>
                    </p>
                  </div>
                </div>
                <Button asChild size="sm">
                  <Link
                    href={
                      actualGroupId != null
                        ? `/noten?classId=${assignment.classId}&groupId=${actualGroupId}`
                        : `/noten?classId=${assignment.classId}`
                    }
                  >
                    <ListChecks className="mr-2 h-4 w-4" />
                    {t('overview.teacher.gradeList')}
                  </Link>
                </Button>
              </div>

              <div className="space-y-5 p-4 sm:p-5">
                {/* Headline stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <StatTile
                    icon={Users}
                    label={t(`overview.teacher.${assignment.period.toLowerCase()}Group`)}
                    value={actualGroupId ?? '—'}
                    accent
                  />
                  <StatTile
                    icon={CalendarDays}
                    label={t('overview.teacher.weeksRemaining')}
                    value={remainingWeeks}
                  />
                  {scheduleTime && (
                    <StatTile
                      icon={Clock}
                      label={t('overview.teacher.scheduleTime')}
                      value={`${scheduleTime.startTime} – ${scheduleTime.endTime}`}
                    />
                  )}
                  {assignment.roomName && (
                    <StatTile
                      icon={MapPin}
                      label={t('overview.teacher.room')}
                      value={assignment.roomName}
                    />
                  )}
                </div>

                {/* Class staff */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <StatTile
                    icon={UserCog}
                    label={t('overview.teacher.classHead')}
                    value={assignment.classHead}
                  />
                  <StatTile
                    icon={UserRound}
                    label={t('overview.teacher.classLead')}
                    value={assignment.classLead}
                  />
                </div>

                {/* Break times */}
                {breakTimes.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-sm font-medium">
                      <Coffee className="h-4 w-4" />
                      {t('overview.teacher.breakTimes')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {breakTimes.map(breakTime => (
                        <Badge key={breakTime.id} variant="soft-muted" className="font-normal">
                          {breakTime.name}: {breakTime.startTime} – {breakTime.endTime}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Additional info — only when there is something to say */}
                {hasAdditionalInfo && (
                  <div className="bg-info/10 text-foreground flex gap-2.5 rounded-lg p-3 text-sm">
                    <Info className="text-info mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-muted-foreground mb-0.5 text-xs font-medium">
                        {t('overview.teacher.additionalInfo')}
                      </p>
                      <p className="font-medium">{trimmedInfo}</p>
                    </div>
                  </div>
                )}

                {/* Other groups running in parallel */}
                {otherGroups.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-sm font-medium">
                      <Users className="h-4 w-4" />
                      {t('overview.teacher.otherGroups')}
                    </p>
                    <div className="divide-border overflow-hidden rounded-lg border">
                      {otherGroups.map(other => (
                        <div
                          key={other.id}
                          className="odd:bg-muted/30 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                        >
                          <Badge variant="outline" className="shrink-0">
                            {t('overview.teacher.groupWithNumber', { group: other.actualGroupId })}
                          </Badge>
                          <span className="font-medium">{getTeacherDisplayName(other)}</span>
                          {other.roomName && (
                            <span className="text-muted-foreground ml-auto flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {other.roomName}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Students in the teacher's group */}
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
                      <Users className="h-4 w-4" />
                      {t('overview.teacher.studentsInGroup', { period: assignment.period })}
                    </p>
                    {students.length > 0 && (
                      <Badge variant="soft-muted" className="tabular-nums">
                        {students.length}
                      </Badge>
                    )}
                  </div>
                  {students.length === 0 ? (
                    <p className="text-muted-foreground text-sm">—</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {students.map((student, index) => (
                        <div
                          key={student.id}
                          className="bg-muted/50 flex items-center gap-2 rounded-md p-2"
                        >
                          <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
                            {index + 1}
                          </span>
                          <StudentPhoto
                            studentId={student.id}
                            firstName={student.firstName}
                            lastName={student.lastName}
                            size={28}
                            nameFormat="firstLast"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    )
  }

  const tabContent = loading ? (
    <div className="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </div>
  ) : error ? (
    <EmptyState
      icon={CalendarX2}
      title={t('overview.teacher.noSchedule')}
      description={t('overview.teacher.noScheduleHint')}
    />
  ) : (
    renderScheduleInfo()
  )

  const weekdays = [
    { value: '1', label: t('overview.weekdays.monday') },
    { value: '2', label: t('overview.weekdays.tuesday') },
    { value: '3', label: t('overview.weekdays.wednesday') },
    { value: '4', label: t('overview.weekdays.thursday') },
    { value: '5', label: t('overview.weekdays.friday') },
  ]

  return (
    <Tabs
      defaultValue={`${today === 0 || today === 6 ? 1 : today}`}
      className="w-full"
      onValueChange={handleTabChange}
    >
      <TabsList className="grid w-full grid-cols-5">
        {weekdays.map(day => (
          <TabsTrigger key={day.value} value={day.value}>
            {day.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {weekdays.map(day => (
        <TabsContent key={day.value} value={day.value} className="mt-4">
          {tabContent}
        </TabsContent>
      ))}
    </Tabs>
  )
}
