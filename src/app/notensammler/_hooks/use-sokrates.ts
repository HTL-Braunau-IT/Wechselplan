import { useCallback, useEffect, useState } from 'react'
import { captureFrontendError } from '@/lib/frontend-error'
import type { Semester } from '@/lib/grades'

export interface SokratesSemesterStatus {
  marked: boolean
  markedAt: string | null
  markedByName: string | null
  lockedAll: boolean
  lockedTeacherIds: number[]
  transferId: number | null
}

export interface SokratesStatus {
  first: SokratesSemesterStatus
  second: SokratesSemesterStatus
}

const emptySemester = (): SokratesSemesterStatus => ({
  marked: false,
  markedAt: null,
  markedByName: null,
  lockedAll: false,
  lockedTeacherIds: [],
  transferId: null,
})

const emptyStatus = (): SokratesStatus => ({ first: emptySemester(), second: emptySemester() })

type Params = {
  classId: number | undefined
  schoolYearId: number | undefined
  setError: (message: string | null) => void
}

/**
 * Reads and mutates the Sokrates transfer/lock state for the open class. The
 * class lead uses this to mark a semester as entered into Sokrates and to
 * escalate to a hard lock; every teacher reads it to know which cells are
 * locked or have drifted since the mark.
 */
export function useSokrates({ classId, schoolYearId, setError }: Params) {
  const [status, setStatus] = useState<SokratesStatus>(emptyStatus())
  const [driftedCells, setDriftedCells] = useState<Set<string>>(new Set())
  const [canManage, setCanManage] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (classId == null || schoolYearId == null) {
        setStatus(emptyStatus())
        setDriftedCells(new Set())
        setCanManage(false)
        return
      }
      try {
        const res = await fetch(
          `/api/notensammler/sokrates?classId=${classId}&schoolYearId=${schoolYearId}`,
          { cache: 'no-store', signal },
        )
        if (!res.ok) return
        const data = (await res.json()) as {
          status: SokratesStatus
          canManage: boolean
          driftedCells: string[]
        }
        setStatus(data.status ?? emptyStatus())
        setCanManage(Boolean(data.canManage))
        setDriftedCells(new Set(data.driftedCells ?? []))
      } catch (e) {
        // A superseded request (class switched mid-flight) is aborted, not an error.
        if (e instanceof DOMException && e.name === 'AbortError') return
        captureFrontendError(e, { location: 'notensammler', type: 'fetch-sokrates-status' })
      }
    },
    [classId, schoolYearId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (classId == null || schoolYearId == null) return false
      try {
        setBusy(true)
        const res = await fetch(`/api/notensammler/sokrates/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, schoolYearId, ...body }),
        })
        if (!res.ok) {
          const err = (await res.json()) as { error?: string }
          throw new Error(err.error ?? 'Aktion fehlgeschlagen')
        }
        await refresh()
        return true
      } catch (e) {
        captureFrontendError(e, { location: 'notensammler', type: `sokrates-${path}` })
        setError(e instanceof Error ? e.message : 'Aktion fehlgeschlagen')
        return false
      } finally {
        setBusy(false)
      }
    },
    [classId, schoolYearId, refresh, setError],
  )

  const mark = useCallback((semester: Semester) => post('mark', { semester }), [post])
  const unmark = useCallback((semester: Semester) => post('unmark', { semester }), [post])
  const setLockAll = useCallback(
    (semester: Semester, locked: boolean) => post('lock', { semester, scope: 'all', locked }),
    [post],
  )
  const setLockTeacher = useCallback(
    (semester: Semester, teacherId: number, locked: boolean) =>
      post('lock', { semester, scope: 'teacher', teacherId, locked }),
    [post],
  )

  /**
   * Whether the whole semester is hard-locked. This is what freezes the
   * class-wide cells (Endnote, Betragensnote) — a per-column lock says nothing
   * about them, so `isCellLocked` is the wrong question there.
   */
  const isSemesterLocked = useCallback(
    (semester: Semester): boolean => status[semester].marked && status[semester].lockedAll,
    [status],
  )

  /** Whether a teacher's column is hard-locked for a semester. */
  const isCellLocked = useCallback(
    (teacherId: number, semester: Semester): boolean => {
      const s = status[semester]
      return s.marked && (s.lockedAll || s.lockedTeacherIds.includes(teacherId))
    },
    [status],
  )

  const isCellDrifted = useCallback(
    (studentId: number, teacherId: number, semester: Semester): boolean =>
      driftedCells.has(`${studentId}:${teacherId}:${semester}`),
    [driftedCells],
  )

  return {
    status,
    canManage,
    busy,
    refresh,
    mark,
    unmark,
    setLockAll,
    setLockTeacher,
    isSemesterLocked,
    isCellLocked,
    isCellDrifted,
  }
}
