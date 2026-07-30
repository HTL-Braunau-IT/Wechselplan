import { useCallback, useEffect, useState } from 'react'
import { captureFrontendError } from '@/lib/frontend-error'
import type { Semester } from '@/lib/grades'

/** One post-Sokrates grade change, already formatted for display. */
export interface SokratesChange {
  id: number
  studentName: string
  subjectTeacherName: string
  oldGrade: string
  newGrade: string
  semester: Semester
  changedByName: string
  changedAt: string
}

type Params = {
  classId: number | undefined
  schoolYearId: number | undefined
  setError: (message: string | null) => void
  /**
   * Run after the class lead acknowledges — the caller uses it to refresh the
   * grid's drift markers (via the sibling {@link useSokrates} hook), so the
   * rings clear the moment the "Gesehen" button is pressed.
   */
  onAfterAcknowledge?: () => void
}

/**
 * The "what changed" rundown for the open class: the grade edits made after its
 * Sokrates mark that have not yet been acknowledged. The class lead sees every
 * change in the class and can acknowledge them all at once; a subject teacher
 * sees only their own (issue #96).
 */
export function useSokratesChanges({
  classId,
  schoolYearId,
  setError,
  onAfterAcknowledge,
}: Params) {
  const [changes, setChanges] = useState<SokratesChange[]>([])
  const [canAcknowledge, setCanAcknowledge] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      // Drop the previous scope's rundown up front: never leave class A's changes
      // on screen (with an acknowledge button now bound to class B) while B loads,
      // or indefinitely if the request fails.
      setChanges([])
      setCanAcknowledge(false)
      if (classId == null || schoolYearId == null) return
      try {
        const res = await fetch(
          `/api/notensammler/sokrates/changes?classId=${classId}&schoolYearId=${schoolYearId}`,
          { cache: 'no-store', signal },
        )
        if (!res.ok) return
        const data = (await res.json()) as { changes: SokratesChange[]; canAcknowledge: boolean }
        setChanges(data.changes ?? [])
        setCanAcknowledge(Boolean(data.canAcknowledge))
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        captureFrontendError(e, { location: 'notensammler', type: 'fetch-sokrates-changes' })
      }
    },
    [classId, schoolYearId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  const acknowledge = useCallback(async () => {
    if (classId == null || schoolYearId == null) return false
    try {
      setBusy(true)
      const res = await fetch('/api/notensammler/sokrates/changes/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, schoolYearId }),
      })
      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        throw new Error(err.error ?? 'Aktion fehlgeschlagen')
      }
      await refresh()
      onAfterAcknowledge?.()
      return true
    } catch (e) {
      captureFrontendError(e, { location: 'notensammler', type: 'acknowledge-sokrates-changes' })
      setError(e instanceof Error ? e.message : 'Aktion fehlgeschlagen')
      return false
    } finally {
      setBusy(false)
    }
  }, [classId, schoolYearId, refresh, onAfterAcknowledge, setError])

  return { changes, canAcknowledge, busy, refresh, acknowledge }
}
