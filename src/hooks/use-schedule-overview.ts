import { useState, useEffect } from 'react'
import type {
  Student,
  Group,
  TeacherAssignmentResponse,
  TeacherAssignmentsResponse,
  ScheduleTime,
  BreakTime,
  TurnSchedule,
  ScheduleResponse,
} from '@/types/types'
import { captureFrontendError } from '@/lib/frontend-error'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'

interface UseScheduleOverviewResult {
  groups: Group[]
  amAssignments: TeacherAssignmentResponse[]
  pmAssignments: TeacherAssignmentResponse[]
  scheduleTimes: ScheduleTime[]
  breakTimes: BreakTime[]
  turns: TurnSchedule
  /** Per-lane Turnusse (AM and PM can have different counts). */
  amTurns: TurnSchedule
  pmTurns: TurnSchedule
  amEnabled: boolean
  pmEnabled: boolean
  classHead: string
  classLead: string
  additionalInfo: string
  weekday: number
  /** Every weekday the class has a plan on (ascending) — for a day picker. */
  availableWeekdays: number[]
  loading: boolean
  error: string | null
}

/**
 * React hook that fetches and aggregates scheduling data for a specified class.
 *
 * Retrieves student groups, teacher assignments, schedule times, break times, rotation schedules, class head and lead names, additional schedule information, and the selected weekday for the given class ID. Returns the collected data along with loading and error states.
 *
 * @param classId - The identifier of the class to retrieve scheduling data for. If null or falsy, sets an error and does not fetch data.
 * @param schoolYearId - Optional school year id; when provided, schedule and assignment data are filtered by this year.
 * @returns An object containing groups, teacher assignments, schedule times, break times, rotation schedule, class head and lead names, additional info, selected weekday, loading status, and error message.
 */
export function useScheduleOverview(
  classId: string | null,
  schoolYearId?: number,
  weekdayFilter?: number,
): UseScheduleOverviewResult {
  const [groups, setGroups] = useState<Group[]>([])
  const [amAssignments, setAmAssignments] = useState<TeacherAssignmentResponse[]>([])
  const [pmAssignments, setPmAssignments] = useState<TeacherAssignmentResponse[]>([])
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [breakTimes, setBreakTimes] = useState<BreakTime[]>([])
  const [turns, setTurns] = useState<TurnSchedule>({})
  const [amTurns, setAmTurns] = useState<TurnSchedule>({})
  const [pmTurns, setPmTurns] = useState<TurnSchedule>({})
  const [amEnabled, setAmEnabled] = useState(true)
  const [pmEnabled, setPmEnabled] = useState(true)
  const [classHead, setClassHead] = useState<string>('—')
  const [classLead, setClassLead] = useState<string>('—')
  const [additionalInfo, setAdditionalInfo] = useState<string>('')
  const [weekday, setWeekday] = useState<number>(0)
  const [availableWeekdays, setAvailableWeekdays] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolvedClassId, setResolvedClassId] = useState<number | null>(null)

  // Resolve className to classId
  useEffect(() => {
    let cancelled = false
    async function resolveClassId() {
      if (!classId) {
        setResolvedClassId(null)
        setError('Class ID is required')
        setLoading(false)
        return
      }
      // Clear the previous class's id first so the data effect below does not run
      // one pass with the NEW class name but the OLD numeric id, which would
      // render one class's students against another's group assignments (finding 14).
      setResolvedClassId(null)
      try {
        const res = await fetch(`/api/classes/get-by-name?name=${classId}`)
        if (!res.ok) throw new Error('Failed to fetch class ID')
        const data = (await res.json()) as { id: number }
        if (cancelled) return
        setResolvedClassId(data.id)
      } catch (err) {
        if (cancelled) return
        console.error('Error resolving class ID:', err)
        setResolvedClassId(null)
        setError('Failed to resolve class ID')
        setLoading(false)
      }
    }
    void resolveClassId()
    return () => {
      cancelled = true
    }
  }, [classId])

  const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''

  useEffect(() => {
    if (!classId || !resolvedClassId) {
      return
    }

    // Invalidate stale writes: a slow class switch would otherwise let an older,
    // in-flight response overwrite the newer class's state (finding 14). Every
    // setState below is gated on this flag; the cleanup flips it on the next run.
    let cancelled = false

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch all students for the class (optionally for school year)
        const studentsRes = await fetch(`/api/students?class=${classId}${yearQ}`, {
          cache: 'no-store',
        })
        if (!studentsRes.ok) throw new Error('Failed to fetch students')
        const students: Student[] = await studentsRes.json()

        // Fetch rotation/turn schedule (filtered by school year when provided)
        // All weekdays, not just the requested one: the list of planned days feeds
        // the day picker, and the requested day is picked out client-side below.
        const schedulesRes = await fetch(`/api/schedules?classId=${classId}${yearQ}`, {
          cache: 'no-store',
        })
        // The schedule row carries the per-lane blobs the API splits out.
        type ScheduleRow = ScheduleResponse & {
          selectedWeekday?: number
          amEnabled?: boolean
          pmEnabled?: boolean
          amScheduleData?: TurnSchedule | null
          pmScheduleData?: TurnSchedule | null
        }
        let latestSchedule: ScheduleRow | undefined
        let selectedWeekday = 6
        let plannedWeekdays: number[] = []

        if (schedulesRes.ok) {
          const schedules = (await schedulesRes.json()) as ScheduleRow[]
          plannedWeekdays = [
            ...new Set(schedules.map(s => s.selectedWeekday).filter((d): d is number => d != null)),
          ].sort((a, b) => a - b)
          // Prefer the requested weekday; otherwise the earliest day of the week, so
          // a class with several plans opens on a predictable one rather than on
          // whichever was created last.
          const byDay = (day: number | undefined) =>
            day != null ? schedules.find(s => s.selectedWeekday === day) : undefined
          latestSchedule = byDay(weekdayFilter) ?? byDay(plannedWeekdays[0]) ?? schedules[0]
          selectedWeekday = latestSchedule?.selectedWeekday ?? 6
        } else if (schedulesRes.status === 404) {
          // No schedules found - this is okay, we'll use defaults
          console.warn(`No schedules found for class ${classId}`)
        } else {
          throw new Error('Failed to fetch rotation schedule')
        }

        if (cancelled) return
        setAdditionalInfo(latestSchedule?.additionalInfo ?? '')
        setWeekday(selectedWeekday)
        setAvailableWeekdays(plannedWeekdays)

        // Everything below belongs to ONE weekday's plan. Reading it unscoped
        // merged every day's teachers into one list (#98 made plans per-weekday).
        const effectiveWeekday = weekdayFilter ?? latestSchedule?.selectedWeekday
        const dayQ = effectiveWeekday != null ? `&selectedWeekday=${effectiveWeekday}` : ''

        // This weekday's groups (groups are per weekday, like everything else).
        const groupRes = await fetch(
          `/api/schedules/assignments?classId=${resolvedClassId}${yearQ}${effectiveWeekday != null ? `&weekday=${effectiveWeekday}` : ''}`,
          { cache: 'no-store' },
        )
        if (!groupRes.ok) throw new Error('Failed to fetch group assignments')
        const groupData: { assignments: { groupId: number; studentIds: number[] }[] } =
          await groupRes.json()
        if (cancelled) return
        setGroups(
          groupData.assignments.map(g => ({
            id: g.groupId,
            students: g.studentIds
              .map(id => students.find(s => s.id === id))
              .filter(Boolean) as Student[],
          })),
        )

        setAmEnabled(latestSchedule?.amEnabled ?? true)
        setPmEnabled(latestSchedule?.pmEnabled ?? true)

        // Per-lane Turnusse come straight off the API's split blobs.
        const amData = (latestSchedule?.amScheduleData as TurnSchedule | null) ?? {}
        const pmData = (latestSchedule?.pmScheduleData as TurnSchedule | null) ?? {}
        setAmTurns(amData)
        setPmTurns(pmData)

        // `turns` keeps its merged meaning for the shared overview display.
        if (
          latestSchedule?.turns &&
          Array.isArray(latestSchedule.turns) &&
          latestSchedule.turns.length > 0
        ) {
          setTurns(normalizeToJsonFormat(latestSchedule.turns))
        } else if (Object.keys(amData).length > 0 || Object.keys(pmData).length > 0) {
          setTurns({ ...pmData, ...amData })
        } else {
          setTurns({})
        }

        // Fetch selected schedule times (optional - continue if this fails)
        try {
          const timesRes = await fetch(`/api/schedules/times?classId=${resolvedClassId}${dayQ}`)
          if (cancelled) return
          if (timesRes.ok) {
            const timesData: { times: { scheduleTimes: ScheduleTime[]; breakTimes: BreakTime[] } } =
              await timesRes.json()
            setScheduleTimes(timesData.times.scheduleTimes)
            setBreakTimes(timesData.times.breakTimes)
          } else {
            console.warn(`Failed to fetch schedule times for class ${classId}`)
            setScheduleTimes([])
            setBreakTimes([])
          }
        } catch (err) {
          console.warn(`Error fetching schedule times for class ${classId}:`, err)
          setScheduleTimes([])
          setBreakTimes([])
        }

        // Fetch teacher assignments for this weekday (each weekday is its own plan).
        try {
          const teacherRes = await fetch(
            `/api/schedules/teacher-assignments?classId=${resolvedClassId}${yearQ}${dayQ}`,
            { cache: 'no-store' },
          )
          if (cancelled) return
          if (teacherRes.ok) {
            const teacherData: TeacherAssignmentsResponse = await teacherRes.json()
            setAmAssignments(teacherData.amAssignments)
            setPmAssignments(teacherData.pmAssignments)
          } else {
            console.warn(`Failed to fetch teacher assignments for class ${classId}`)
            setAmAssignments([])
            setPmAssignments([])
          }
        } catch (err) {
          console.warn(`Error fetching teacher assignments for class ${classId}:`, err)
          setAmAssignments([])
          setPmAssignments([])
        }

        // Fetch class data
        const classRes = await fetch(`/api/classes/get-by-name?name=${classId}`)
        if (!classRes.ok) throw new Error('Failed to fetch class data')
        const classData = (await classRes.json()) as {
          classHead: { firstName: string; lastName: string } | null
          classLead: { firstName: string; lastName: string } | null
        }
        if (cancelled) return
        setClassHead(
          classData.classHead
            ? `${classData.classHead.firstName} ${classData.classHead.lastName}`
            : '—',
        )
        setClassLead(
          classData.classLead
            ? `${classData.classLead.firstName} ${classData.classLead.lastName}`
            : '—',
        )
      } catch (err) {
        if (cancelled) return
        console.error('Error fetching overview data:', err)
        captureFrontendError(err, {
          location: 'schedule/create/overview',
          type: 'fetch-data',
          extra: {
            classId,
          },
        })
        const errMsg = err instanceof Error ? err.message : 'Failed to load overview data'
        setError(errMsg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchData()
    return () => {
      cancelled = true
    }
  }, [classId, resolvedClassId, yearQ, weekdayFilter])

  return {
    groups,
    amAssignments,
    pmAssignments,
    scheduleTimes,
    breakTimes,
    turns,
    amTurns,
    pmTurns,
    amEnabled,
    pmEnabled,
    classHead,
    classLead,
    additionalInfo,
    weekday,
    availableWeekdays,
    loading,
    error,
  }
}
