'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import type { TeacherAssignmentResponse } from '@/types/types'
import { generateExcel, generatePdf, generateSchedulePDF } from '@/lib/export-utils'
import { captureFrontendError } from '@/lib/frontend-error'

export type ScheduleExportKind = 'pdf' | 'pdfDated' | 'excelAm' | 'excelPm'

export interface UseScheduleExportResult {
  /** Which export, if any, is currently running — drives the toolbar's busy state. */
  running: ScheduleExportKind | null
  /** True while any export is in flight. */
  busy: boolean
  /** The signed-in teacher is assigned to the morning period of this class. */
  canExcelAm: boolean
  /** The signed-in teacher is assigned to the afternoon period of this class. */
  canExcelPm: boolean
  runExport: (kind: ScheduleExportKind) => void
}

/**
 * Export actions for a single class's rotation plan.
 *
 * The Excel exports are a teacher's blank grade list, so they are only offered
 * to a teacher actually assigned to that period. Which period the current
 * teacher teaches is resolved once here — from `/api/teachers/me` (OID-first,
 * post-Entra safe) against the assignments already loaded for the overview —
 * rather than re-fetched from three endpoints in both the page and the
 * overview component the way it used to be.
 */
export function useScheduleExport({
  className,
  weekday,
  amAssignments,
  pmAssignments,
}: {
  className: string | null
  weekday: number
  amAssignments: TeacherAssignmentResponse[]
  pmAssignments: TeacherAssignmentResponse[]
}): UseScheduleExportResult {
  const { data: session } = useSession()
  const [running, setRunning] = useState<ScheduleExportKind | null>(null)
  const [teacherId, setTeacherId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function resolveTeacher() {
      if (!className) {
        setTeacherId(null)
        return
      }
      try {
        const res = await fetch('/api/teachers/me', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setTeacherId(null)
          return
        }
        const { teacher } = (await res.json()) as { teacher: { id: number } | null }
        if (!cancelled) setTeacherId(teacher?.id ?? null)
      } catch {
        if (!cancelled) setTeacherId(null)
      }
    }
    void resolveTeacher()
    return () => {
      cancelled = true
    }
  }, [className])

  const canExcelAm = teacherId != null && amAssignments.some(a => a.teacherId === teacherId)
  const canExcelPm = teacherId != null && pmAssignments.some(a => a.teacherId === teacherId)

  const runExport = (kind: ScheduleExportKind) => {
    if (!className || running) return
    setRunning(kind)
    const teacherName = session?.user?.name ?? ''
    const task =
      kind === 'pdf'
        ? generatePdf(className, weekday)
        : kind === 'pdfDated'
          ? generateSchedulePDF(className, weekday)
          : kind === 'excelAm'
            ? generateExcel(className, weekday, teacherName, 'AM')
            : generateExcel(className, weekday, teacherName, 'PM')

    task
      .catch(error => {
        captureFrontendError(error, { location: 'schedules', type: `export-${kind}` })
      })
      .finally(() => setRunning(null))
  }

  return {
    running,
    busy: running !== null,
    canExcelAm,
    canExcelPm,
    runExport,
  }
}
