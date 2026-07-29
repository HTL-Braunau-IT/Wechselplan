import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { addWeeks, isValid, isWithinInterval, parse } from 'date-fns'
import type { ClassItem } from '../_lib/types'

type ScheduleData = {
  schedules?: Array<
    Array<{
      classId: number | null
      turns?: Array<{ name: string; weeks: Array<{ date: string; isHoliday?: boolean }> }>
    }>
  >
  teacherRotation?: Array<{
    teacherId: number
    classId: number
    period: string
    turnId: string
    groupId: number
  }>
  assignments?: Array<{ teacherId: number; classId: number; period: string; groupId: number }>
}

/** Turn whose week range contains the given date, if any. */
function findCurrentTurnName(
  turns: Array<{ name: string; weeks: Array<{ date: string }> }> | undefined,
  now: Date,
): string | null {
  if (!turns?.length) return null
  for (const turn of turns) {
    const active = turn.weeks.some(week => {
      const start = parse(week.date, 'dd.MM.yy', new Date())
      if (!isValid(start)) return false
      return isWithinInterval(now, { start, end: addWeeks(start, 1) })
    })
    if (active) return turn.name
  }
  return null
}

/**
 * The teacher's classes plus the initial class/group selection.
 *
 * Selection comes from the URL when present (a link from the teacher
 * overview), otherwise it is inferred from the rotation for right now so the
 * page opens on the group the teacher is actually teaching.
 */
export function useNotenClasses(schoolYearId: number | null) {
  const { data: session } = useSession()
  const searchParams = useSearchParams()

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  // Guards a race: an in-flight auto-select must not overwrite a newer choice.
  const selectedClassIdRef = useRef<number | null>(null)
  selectedClassIdRef.current = selectedClassId
  const urlParamsAppliedRef = useRef(false)

  useEffect(() => {
    if (!schoolYearId) return
    let cancelled = false
    void (async () => {
      setLoadingClasses(true)
      try {
        const res = await fetch(`/api/noten/teacher-classes?schoolYearId=${schoolYearId}`)
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { classes?: ClassItem[] }
        if (!cancelled) setClasses(data.classes ?? [])
      } finally {
        if (!cancelled) setLoadingClasses(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [schoolYearId])

  // Explicit ?classId/&groupId wins over any inference.
  useEffect(() => {
    if (urlParamsAppliedRef.current || classes.length === 0) return
    const classIdParam = searchParams.get('classId')
    if (!classIdParam) return
    urlParamsAppliedRef.current = true

    const classId = Number(classIdParam)
    if (!Number.isFinite(classId)) return
    const cls = classes.find(c => c.id === classId)
    if (!cls) return

    const groupIdParam = searchParams.get('groupId')
    const groupId = groupIdParam ? Number(groupIdParam) : null
    setSelectedClassId(cls.id)
    setSelectedGroupId(
      groupId != null && Number.isFinite(groupId) && cls.groupIds.includes(groupId)
        ? groupId
        : (cls.groupIds[0] ?? null),
    )
  }, [classes, searchParams])

  // Infer the class/group being taught right now, matching the teacher overview.
  useEffect(() => {
    if (searchParams.get('classId')) return
    const teacherName = session?.user?.name
    if (!schoolYearId || classes.length === 0 || !teacherName) return

    let cancelled = false
    const fallbackToFirstClass = () => {
      const first = classes[0]
      if (first && !cancelled) {
        setSelectedClassId(first.id)
        setSelectedGroupId(first.groupIds[0] ?? null)
      }
    }

    void (async () => {
      const now = new Date()
      const day = now.getDay()
      // Weekends have no lessons; fall back to Monday's plan.
      const weekday = day === 0 || day === 6 ? 1 : day
      const period = now.getHours() < 12 ? 'AM' : 'PM'

      const res = await fetch(
        `/api/schedules/data?teacher=${encodeURIComponent(teacherName)}&weekday=${weekday}&schoolYearId=${schoolYearId}`,
      )
      if (!res.ok || cancelled) return
      const data = (await res.json()) as ScheduleData

      if (!data.assignments?.length || !data.schedules?.length) {
        fallbackToFirstClass()
        return
      }

      const periodAssignments = data.assignments.filter(a => a.period === period)
      const turnsForClass = (classId: number) =>
        data.schedules?.find(schedules => schedules.some(s => Number(s.classId) === classId))?.[0]
          ?.turns

      for (const assignment of periodAssignments) {
        const turnName = findCurrentTurnName(turnsForClass(assignment.classId), now)
        if (!turnName || !data.teacherRotation?.length) continue
        const rotation = data.teacherRotation.find(
          r =>
            r.classId === assignment.classId &&
            r.period === period &&
            r.turnId === turnName &&
            Number(r.teacherId) === Number(assignment.teacherId),
        )
        if (rotation && !cancelled) {
          setSelectedClassId(rotation.classId)
          setSelectedGroupId(rotation.groupId)
          return
        }
      }

      const first = periodAssignments[0]
      if (first && !cancelled) {
        setSelectedClassId(first.classId)
        setSelectedGroupId(first.groupId)
      } else {
        fallbackToFirstClass()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [schoolYearId, classes, session?.user?.name, searchParams])

  // Nothing chosen and nothing inferred: open the first class.
  useEffect(() => {
    if (searchParams.get('classId')) return
    if (selectedClassId !== null || classes.length === 0) return
    const first = classes[0]
    if (first) {
      setSelectedClassId(first.id)
      setSelectedGroupId(first.groupIds[0] ?? null)
    }
  }, [classes, selectedClassId, searchParams])

  /** Switch class, then ask the server which group is on right now. */
  const selectClass = useCallback(
    (classId: number) => {
      const cls = classes.find(c => c.id === classId)
      selectedClassIdRef.current = classId
      setSelectedClassId(classId)
      setSelectedGroupId(cls?.groupIds[0] ?? null)
      if (!schoolYearId || !cls) return

      void (async () => {
        const fallback = () => {
          if (selectedClassIdRef.current === classId) setSelectedGroupId(cls.groupIds[0] ?? null)
        }
        try {
          const res = await fetch(
            `/api/noten/auto-select?schoolYearId=${schoolYearId}&classId=${classId}`,
          )
          if (!res.ok) return fallback()
          const data = (await res.json()) as { classId: number | null; groupId: number | null }
          const groupId =
            data.groupId != null && cls.groupIds.includes(data.groupId)
              ? data.groupId
              : (cls.groupIds[0] ?? null)
          // Only apply if the user has not moved on to another class.
          if (selectedClassIdRef.current === classId) setSelectedGroupId(groupId)
        } catch {
          fallback()
        }
      })()
    },
    [classes, schoolYearId],
  )

  return {
    classes,
    loadingClasses,
    selectedClassId,
    setSelectedClassId,
    selectedGroupId,
    setSelectedGroupId,
    selectClass,
  }
}
