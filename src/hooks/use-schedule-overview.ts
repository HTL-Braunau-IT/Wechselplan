import { useState, useEffect } from 'react'
import type { Student, Group, TeacherAssignmentResponse, TeacherAssignmentsResponse, ScheduleTime, BreakTime, TurnSchedule, ScheduleResponse } from '@/types/types'
import { captureFrontendError } from '@/lib/frontend-error'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'

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
 * @returns An object containing groups, teacher assignments, schedule times, break times, rotation schedule, class head and lead names, additional info, selected weekday, loading status, and error message.
 */
export function useScheduleOverview(classId: string | null): UseScheduleOverviewResult {
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
        const res = await fetch(`/api/classes/get-by-name?name=${classId}`)
        if (!res.ok) throw new Error('Failed to fetch class ID')
        const data = await res.json() as { id: number }
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

  useEffect(() => {
    if (!classId || !resolvedClassId) {
      return
    }

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Fetch all students for the class
        const studentsRes = await fetch(`/api/students?class=${classId}`)
        if (!studentsRes.ok) throw new Error('Failed to fetch students')
        const students: Student[] = await studentsRes.json()

        // Fetch group assignments
        const groupRes = await fetch(`/api/schedules/assignments?classId=${resolvedClassId}`)
        if (!groupRes.ok) throw new Error('Failed to fetch group assignments')
        const groupData: { assignments: { groupId: number; studentIds: number[] }[] } = await groupRes.json()
        setGroups(
          groupData.assignments.map((g) => ({
            id: g.groupId,
            students: g.studentIds.map(id => students.find(s => s.id === id)).filter(Boolean) as Student[]
          }))
        )

        // Fetch selected schedule times (optional - continue if this fails)
        try {
          const timesRes = await fetch(`/api/schedules/times?classId=${resolvedClassId}`)
          if (timesRes.ok) {
            const timesData: { times: { scheduleTimes: ScheduleTime[]; breakTimes: BreakTime[] } } = await timesRes.json()
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

        // Fetch rotation/turn schedule
        const schedulesRes = await fetch(`/api/schedules?classId=${classId}`)
        let latestSchedule: ScheduleResponse | undefined
        let selectedWeekday = 6
        
        if (schedulesRes.ok) {
          const schedules = await schedulesRes.json() as ScheduleResponse[]
          // Get the most recent schedule (ordered by createdAt desc from API)
          latestSchedule = schedules[0]
          selectedWeekday = latestSchedule?.selectedWeekday ?? 6
        } else if (schedulesRes.status === 404) {
          // No schedules found - this is okay, we'll use defaults
          console.warn(`No schedules found for class ${classId}`)
        } else {
          throw new Error('Failed to fetch rotation schedule')
        }
        
        setAdditionalInfo(latestSchedule?.additionalInfo ?? '')
        setWeekday(selectedWeekday)
        
        // Convert normalized turns to legacy format, or fall back to scheduleData if available
        if (latestSchedule?.turns && Array.isArray(latestSchedule.turns) && latestSchedule.turns.length > 0) {
          // Use normalized turns data
          const normalizedTurns = normalizeToJsonFormat(latestSchedule.turns)
          setTurns(normalizedTurns)
        } else if (latestSchedule?.scheduleData && typeof latestSchedule.scheduleData === 'object') {
          // Fall back to scheduleData for backward compatibility
          setTurns(latestSchedule.scheduleData as TurnSchedule)
        } else {
          // No turn data available
          setTurns({})
        }

        // Fetch teacher assignments (no weekday filter needed - each class has one schedule)
        try {
          const teacherRes = await fetch(`/api/schedules/teacher-assignments?classId=${resolvedClassId}`)
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
        const classData = await classRes.json() as { classHead: { firstName: string, lastName: string } | null; classLead: { firstName: string, lastName: string } | null }
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
  }, [classId, resolvedClassId])

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