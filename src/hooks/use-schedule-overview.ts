import { useState, useEffect } from 'react'
import type { Student, Group, TeacherAssignmentResponse, TeacherAssignmentsResponse, ScheduleTime, BreakTime, TurnSchedule, ScheduleResponse } from '@/types/types'
import { captureFrontendError } from '@/lib/frontend-error'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'
import { applyPmTracksToTurnScheduleRecord, isPmBiweeklyAnchor } from '@/lib/pm-biweekly-track'
import { fetchAndUnwrap, parseJsonSafe, unwrapData } from '@/lib/api-client'

interface UseScheduleOverviewResult {
  groups: Group[]
  amAssignments: TeacherAssignmentResponse[]
  pmAssignments: TeacherAssignmentResponse[]
  scheduleTimes: ScheduleTime[]
  breakTimes: BreakTime[]
  turns: TurnSchedule
  classHead: string
  classLead: string
  additionalInfo: string
  weekday: number
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
  weekdayOverride?: number | null
): UseScheduleOverviewResult {
  const [groups, setGroups] = useState<Group[]>([])
  const [amAssignments, setAmAssignments] = useState<TeacherAssignmentResponse[]>([])
  const [pmAssignments, setPmAssignments] = useState<TeacherAssignmentResponse[]>([])
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [breakTimes, setBreakTimes] = useState<BreakTime[]>([])
  const [turns, setTurns] = useState<TurnSchedule>({})
  const [classHead, setClassHead] = useState<string>('—')
  const [classLead, setClassLead] = useState<string>('—')
  const [additionalInfo, setAdditionalInfo] = useState<string>('')
  const [weekday, setWeekday] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolvedClassId, setResolvedClassId] = useState<number | null>(null)

  // Resolve className to classId
  useEffect(() => {
    async function resolveClassId() {
      if (!classId) {
        setResolvedClassId(null)
        setError('Class ID is required')
        setLoading(false)
        return
      }
      try {
        const data = await fetchAndUnwrap<{ id: number }>(`/api/classes/get-by-name?name=${classId}`)
        setResolvedClassId(data.id)
      } catch (err) {
        console.error('Error resolving class ID:', err)
        setResolvedClassId(null)
        setError('Failed to resolve class ID')
        setLoading(false)
      }
    }
    void resolveClassId()
  }, [classId])

  const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''

  useEffect(() => {
    if (!classId || !resolvedClassId) {
      return
    }

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch all students for the class (optionally for school year)
        const studentsRes = await fetch(`/api/students?class=${classId}${yearQ}`, { cache: 'no-store' })
        if (!studentsRes.ok) throw new Error('Failed to fetch students')
        const studentsPayload = await studentsRes.json() as { data?: Student[] } | Student[]
        const students: Student[] = Array.isArray(studentsPayload) ? studentsPayload : (studentsPayload.data ?? [])

        const schedulesListRes = await fetch(`/api/schedules?classId=${classId}${yearQ}`, { cache: 'no-store' })
        let list: ScheduleResponse[] = []
        if (schedulesListRes.ok) {
          const raw = await schedulesListRes.json() as { data?: ScheduleResponse[] } | ScheduleResponse[]
          list = Array.isArray(raw) ? raw : (raw.data ?? [])
        }

        let effectiveWd = 1
        if (weekdayOverride != null && weekdayOverride >= 1 && weekdayOverride <= 5) {
          effectiveWd = weekdayOverride
        } else if (list[0]) {
          effectiveWd = list[0].selectedWeekday
        }

        const weekdayQ = `&weekday=${effectiveWd}`

        const groupRes = await fetch(
          `/api/schedules/assignments?classId=${resolvedClassId}${yearQ}${weekdayQ}`,
          { cache: 'no-store' }
        )
        if (!groupRes.ok) throw new Error('Failed to fetch group assignments')
        const groupPayload = await parseJsonSafe(groupRes)
        const groupData = unwrapData<{ assignments?: { groupId: number; studentIds: number[] }[] }>(
          groupPayload ?? {}
        )
        const assignmentRows = groupData.assignments ?? []
        setGroups(
          assignmentRows.map((g) => ({
            id: g.groupId,
            students: g.studentIds.map(id => students.find(s => s.id === id)).filter(Boolean) as Student[]
          }))
        )

        try {
          const timesQ = `${yearQ}${weekdayQ}`
          const timesRes = await fetch(`/api/schedules/times?classId=${resolvedClassId}${timesQ}`)
          if (timesRes.ok) {
            const timesData = unwrapData<{ times: { scheduleTimes: ScheduleTime[]; breakTimes: BreakTime[] } }>(
              await parseJsonSafe(timesRes)
            )
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

        let latestSchedule: ScheduleResponse | undefined =
          list.find((s) => s.selectedWeekday === effectiveWd) ?? list[0]
        const selectedWeekday = latestSchedule?.selectedWeekday ?? effectiveWd

        if (!schedulesListRes.ok && schedulesListRes.status !== 404) {
          throw new Error('Failed to fetch rotation schedule')
        }
        if (schedulesListRes.status === 404) {
          console.warn(`No schedules found for class ${classId}`)
        }

        setAdditionalInfo(latestSchedule?.additionalInfo ?? '')
        setWeekday(selectedWeekday)
        
        if (latestSchedule?.turns && Array.isArray(latestSchedule.turns) && latestSchedule.turns.length > 0) {
          const normalizedTurns = normalizeToJsonFormat(latestSchedule.turns)
          const anchor = isPmBiweeklyAnchor(latestSchedule.pmBiweeklyAnchor)
            ? latestSchedule.pmBiweeklyAnchor
            : null
          setTurns(applyPmTracksToTurnScheduleRecord(normalizedTurns, anchor))
        } else {
          setTurns({})
        }

        try {
          const teacherWd = `&selectedWeekday=${selectedWeekday}`
          const teacherRes = await fetch(
            `/api/schedules/teacher-assignments?classId=${resolvedClassId}${yearQ}${teacherWd}`,
            { cache: 'no-store' }
          )
          if (teacherRes.ok) {
            const teacherPayload = await parseJsonSafe(teacherRes)
            const teacherData = unwrapData<TeacherAssignmentsResponse>(teacherPayload)
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
        const classData = await fetchAndUnwrap<{ classHead: { firstName: string, lastName: string } | null; classLead: { firstName: string, lastName: string } | null }>(
          `/api/classes/get-by-name?name=${classId}`
        )
        setClassHead(classData.classHead ? `${classData.classHead.firstName} ${classData.classHead.lastName}` : '—')
        setClassLead(classData.classLead ? `${classData.classLead.firstName} ${classData.classLead.lastName}` : '—')

      } catch (err) {
        console.error('Error fetching overview data:', err)
        captureFrontendError(err, {
          location: 'schedule/create/overview',
          type: 'fetch-data',
          extra: {
            classId
          }
        })
        const errMsg = err instanceof Error ? err.message : 'Failed to load overview data'
        setError(errMsg)
      } finally {
        setLoading(false)
      }
    }

    void fetchData()
  }, [classId, resolvedClassId, yearQ, weekdayOverride])

  return {
    groups,
    amAssignments,
    pmAssignments,
    scheduleTimes,
    breakTimes,
    turns,
    classHead,
    classLead,
    additionalInfo,
    weekday,
    loading,
    error
  }
} 