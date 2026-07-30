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
  const [isAdmin, setIsAdmin] = useState(false)
  // An admin who is not the class lead has no Sokrates power until they flip this
  // on — a deliberate, one-off override, reset whenever the open class changes so
  // it never silently follows them from one class to the next.
  const [adminOverride, setAdminOverride] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setAdminOverride(false)
  }, [classId, schoolYearId])

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (classId == null || schoolYearId == null) {
        setStatus(emptyStatus())
        setDriftedCells(new Set())
        setCanManage(false)
        setIsAdmin(false)
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
          isAdmin?: boolean
          driftedCells: string[]
        }
        setStatus(data.status ?? emptyStatus())
        setCanManage(Boolean(data.canManage))
        setIsAdmin(Boolean(data.isAdmin))
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
          // The override flag rides along only when an admin has switched it on;
          // the server ignores it for anyone who is not an admin.
          body: JSON.stringify({
            classId,
            schoolYearId,
            ...(adminOverride && { adminOverride: true }),
            ...body,
          }),
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
    [classId, schoolYearId, adminOverride, refresh, setError],
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
    /** Whether the current user is the class lead (the standing manager). */
    canManage,
    /** Whether the current user is an admin (eligible for the override toggle). */
    isAdmin,
    /** Whether the admin has switched the one-time override on for this class. */
    adminOverride,
    setAdminOverride,
    /**
     * The class lead, or an admin who has switched the override on: whoever may
     * mark/lock and edit locked cells right now.
     */
    canManageEffective: canManage || (isAdmin && adminOverride),
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
