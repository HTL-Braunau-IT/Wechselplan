import { useState, useEffect } from 'react'
import type { Student, Group, TeacherAssignmentResponse, TeacherAssignmentsResponse, ScheduleTime, BreakTime, TurnSchedule, ScheduleResponse } from '@/types/types'

interface UseScheduleOverviewResult {
  groups: Group[]
  amAssignments: TeacherAssignmentResponse[]
  pmAssignments: TeacherAssignmentResponse[]
  scheduleTimes: ScheduleTime[]
  breakTimes: BreakTime[]
  turns: TurnSchedule
  loading: boolean
  error: string | null
}

export function useScheduleOverview(classId: string | null): UseScheduleOverviewResult {
  const [groups, setGroups] = useState<Group[]>([])
  const [amAssignments, setAmAssignments] = useState<TeacherAssignmentResponse[]>([])
  const [pmAssignments, setPmAssignments] = useState<TeacherAssignmentResponse[]>([])
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [breakTimes, setBreakTimes] = useState<BreakTime[]>([])
  const [turns, setTurns] = useState<TurnSchedule>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!classId) {
      setError('Class ID is required')
      setLoading(false)
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
        const groupRes = await fetch(`/api/schedule/assignments?class=${classId}`)
        if (!groupRes.ok) throw new Error('Failed to fetch group assignments')
        const groupData: { assignments: { groupId: number; studentIds: number[] }[] } = await groupRes.json()
        setGroups(
          groupData.assignments.map((g) => ({
            id: g.groupId,
            students: g.studentIds.map(id => students.find(s => s.id === id)).filter(Boolean) as Student[]
          }))
        )

        // Fetch teacher assignments
        const teacherRes = await fetch(`/api/schedule/teacher-assignments?class=${classId}`)
        if (!teacherRes.ok) throw new Error('Failed to fetch teacher assignments')
        const teacherData: TeacherAssignmentsResponse = await teacherRes.json()
        setAmAssignments(teacherData.amAssignments)
        setPmAssignments(teacherData.pmAssignments)

        // Fetch selected schedule times
        const timesRes = await fetch(`/api/schedules/times?class=${classId}`)
        if (!timesRes.ok) throw new Error('Failed to fetch schedule times')
        const timesData: { scheduleTimes?: ScheduleTime[]; breakTimes?: BreakTime[] } = await timesRes.json()
        setScheduleTimes(timesData.scheduleTimes ?? [])
        setBreakTimes(timesData.breakTimes ?? [])

        // Fetch rotation/turn schedule
        const schedulesRes = await fetch(`/api/schedules?classId=${classId}`)
        if (!schedulesRes.ok) throw new Error('Failed to fetch rotation schedule')
        const schedules = await schedulesRes.json() as ScheduleResponse[]
        const latestSchedule = schedules[0]
        const scheduleData = latestSchedule?.scheduleData ?? {}
        setTurns(scheduleData as TurnSchedule)
      } catch (err) {
        console.error('Error fetching overview data:', err)
        const errMsg = err instanceof Error ? err.message : 'Failed to load overview data'
        setError(errMsg)
      } finally {
        setLoading(false)
      }
    }

    void fetchData()
  }, [classId])

  return {
    groups,
    amAssignments,
    pmAssignments,
    scheduleTimes,
    breakTimes,
    turns,
    loading,
    error
  }
} 