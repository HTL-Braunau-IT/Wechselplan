'use client'

import { useEffect, useState } from 'react'
import { captureFrontendError } from '@/lib/frontend-error'
import type { ScheduleClassOption } from '../_components/class-picker'

interface UseSchedulesListResult {
  classes: ScheduleClassOption[]
  loading: boolean
  error: string | null
}

/**
 * The classes for the selected school year, each tagged with whether a rotation
 * plan exists for it. Merges `/api/classes` with `/api/schedules/all` so the
 * picker can show availability without loading each class's full schedule.
 */
export function useSchedulesList(schoolYearId: number | undefined): UseSchedulesListResult {
  const [classes, setClasses] = useState<ScheduleClassOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)

        const yearQ = schoolYearId != null ? `?schoolYearId=${schoolYearId}` : ''
        const [schedulesRes, classesRes] = await Promise.all([
          fetch(`/api/schedules/all${yearQ}`, { cache: 'no-store' }),
          fetch(`/api/classes${yearQ}`, { cache: 'no-store' }),
        ])
        if (!schedulesRes.ok || !classesRes.ok) throw new Error('Failed to load classes')

        const schedules = (await schedulesRes.json()) as { classId: number | null }[]
        const classList = (await classesRes.json()) as { id: number; name: string }[]
        const scheduledClassIds = new Set(
          schedules.map(s => s.classId).filter((id): id is number => id !== null),
        )

        if (!cancelled) {
          setClasses(
            classList.map(cls => ({
              id: cls.id,
              name: cls.name,
              hasSchedule: scheduledClassIds.has(cls.id),
            })),
          )
        }
      } catch (e) {
        captureFrontendError(e, { location: 'schedules', type: 'load-list' })
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [schoolYearId])

  return { classes, loading, error }
}
