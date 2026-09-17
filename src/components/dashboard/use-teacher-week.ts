'use client'

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { TeacherScheduleData } from '@/types/types'
import { resolveDay, turnStartingOn, turnusSummary, type ResolvedSlot } from './resolve-slot'

const WEEKDAYS = [1, 2, 3, 4, 5] as const
const SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr'] as const

export type WeekDay = {
  weekday: number
  short: string
  /** Actual calendar date of this weekday in the current week. */
  date: Date
  /** Local YYYY-MM-DD, the form the noten entries use. */
  ymd: string
  isToday: boolean
  slots: ResolvedSlot[]
  hasAM: boolean
  hasPM: boolean
  /** Name of a turnus that begins this weekday, for the strip marker. */
  turnStartName: string | null
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function ddmmyy(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
    d.getFullYear(),
  ).slice(2)}`
}

/** Monday of the calendar week containing `now`, at local midnight. */
function mondayOf(now: Date): Date {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const offset = (monday.getDay() + 6) % 7 // 0 = Monday
  monday.setDate(monday.getDate() - offset)
  return monday
}

async function fetchDay(
  teacher: string,
  weekday: number,
  schoolYearId: number,
): Promise<TeacherScheduleData | null> {
  const res = await fetch(
    `/api/schedules/data?teacher=${encodeURIComponent(teacher)}&weekday=${weekday}&schoolYearId=${schoolYearId}`,
  )
  if (!res.ok) return null
  const data = (await res.json()) as TeacherScheduleData & { error?: string }
  // The route answers "nothing scheduled" as HTTP 200 with an { error } body.
  if (data.error || !data.schedules || data.schedules.length === 0) return null
  return data
}

/**
 * The teacher's whole current week: one `/api/schedules/data` read per weekday,
 * cached, resolved into ready-to-render slots so switching days needs no refetch.
 * `now` is passed in (not read here) so the caller controls the reference date.
 */
export function useTeacherWeek(teacher: string | null | undefined, schoolYearId: number | null) {
  const now = useMemo(() => new Date(), [])
  const monday = useMemo(() => mondayOf(now), [now])

  const queries = useQueries({
    queries: WEEKDAYS.map(weekday => ({
      queryKey: ['dashboard-week', teacher, schoolYearId, weekday],
      queryFn: () => fetchDay(teacher!, weekday, schoolYearId!),
      enabled: Boolean(teacher) && schoolYearId != null,
      staleTime: 1000 * 60 * 5,
    })),
  })

  const isLoading = queries.some(q => q.isLoading)
  const isError = queries.every(q => q.isError)

  // Building five small day objects each render is cheap; React Compiler holds
  // the result stable, so no manual memo (whose dep would have to be the whole
  // query array) is needed here.
  const rawByWeekday = WEEKDAYS.map((_, i) => queries[i]?.data ?? null)

  const days: WeekDay[] = WEEKDAYS.map((weekday, i) => {
    const data = rawByWeekday[i] ?? null
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const slots = resolveDay(data, now)
    const primaryClassId = slots[0]?.classId
    return {
      weekday,
      short: SHORT[i] ?? '',
      date,
      ymd: ymd(date),
      isToday: ymd(date) === ymd(now),
      slots,
      hasAM: slots.some(s => s.period === 'AM'),
      hasPM: slots.some(s => s.period === 'PM'),
      turnStartName: turnStartingOn(data, primaryClassId, ddmmyy(date)),
    }
  })

  return {
    now,
    days,
    isLoading,
    isError,
    /** Raw payload per weekday index (0 = Monday), for turnus summaries. */
    rawByWeekday,
    turnusSummary,
  }
}
