import { useCallback, useRef, useState } from 'react'
import { captureFrontendError } from '@/lib/frontend-error'
import {
  CONDUCT_NOTE_WISH_NONE,
  GESTUNDEN,
  NICHT_BEURTEILT,
  computeAverage,
  parseFinalGradeInput,
  parseGradeInput,
  type GradesData,
  type Semester,
} from '@/lib/grades'
import { useKeyedDebounce } from '@/hooks/use-keyed-debounce'
import type { SaveState } from '@/components/save-status'
import type { ClassData, FinalGradesData, Period } from '../_lib/types'

const SAVE_DEBOUNCE_MS = 500
/**
 * Rows per request for "Alle speichern". The two batch endpoints have
 * different ceilings — `MAX_GRADES_BATCH` is 400, `MAX_FINAL_GRADES_BATCH` is
 * 100 — so they get their own chunk size, each with headroom.
 */
const GRADES_CHUNK_SIZE = 200
const FINAL_GRADES_CHUNK_SIZE = 50

export type { SaveState }

type Params = {
  classData: ClassData | null
  schoolYearId: number | undefined
  grades: GradesData
  setGrades: React.Dispatch<React.SetStateAction<GradesData>>
  finalGrades: FinalGradesData
  setFinalGrades: React.Dispatch<React.SetStateAction<FinalGradesData>>
  setError: (message: string | null) => void
  /** Non-fatal outcomes (locked cells skipped) — not rendered as a failure. */
  setNotice?: (message: string | null) => void
  refreshTeacherClasses: () => Promise<void>
  /** Re-reads Sokrates lock/drift state after a save so badges stay current. */
  refreshSokrates?: () => void | Promise<void>
}

const emptyFinalGrade = () => ({
  first: null,
  second: null,
  conductWishFirst: null,
  conductWishSecond: null,
})

/** Grade entry, autosave and the derived averages for the Notensammler grid. */
export function useGradeEditing({
  classData,
  schoolYearId,
  grades,
  setGrades,
  finalGrades,
  setFinalGrades,
  setError,
  setNotice,
  refreshTeacherClasses,
  refreshSokrates,
}: Params) {
  const [saving, setSaving] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const { schedule, cancelAll, pendingCount } = useKeyedDebounce(SAVE_DEBOUNCE_MS)

  // `saving` is a boolean but several cells can be in flight at once, so the
  // first response must not clear the indicator for the rest.
  const inFlightRef = useRef(0)
  const beginRequest = useCallback(() => {
    inFlightRef.current += 1
    setSaving(true)
  }, [])
  const endRequest = useCallback((ok: boolean) => {
    inFlightRef.current = Math.max(0, inFlightRef.current - 1)
    if (inFlightRef.current === 0) setSaving(false)
    if (ok) {
      setSaveFailed(false)
      setSavedAt(Date.now())
    } else {
      setSaveFailed(true)
    }
  }, [])

  const saveGrade = useCallback(
    async (studentId: number, teacherId: number, semester: Semester, grade: number | null) => {
      if (!classData) return
      let ok = false
      try {
        beginRequest()

        const response = await fetch('/api/notensammler/grades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId,
            teacherId,
            classId: classData.id,
            semester,
            grade,
            ...(schoolYearId != null && { schoolYearId }),
          }),
        })

        if (!response.ok) {
          const errorData = (await response.json()) as { error?: string }
          throw new Error(errorData.error ?? 'Failed to save grade')
        }
        ok = true
      } catch (e) {
        captureFrontendError(e, { location: 'notensammler', type: 'save-grade' })
        throw e
      } finally {
        endRequest(ok)
      }
    },
    // schoolYearId belongs here: without it the callback kept sending the
    // school year that was selected when the class was first opened.
    [beginRequest, classData, endRequest, schoolYearId],
  )

  const handleGradeChange = useCallback(
    (studentId: number, teacherId: number, semester: Semester, value: string) => {
      const gradeValue = parseGradeInput(value)
      const previousValue = grades[studentId]?.[teacherId]?.[semester] ?? null

      setGrades(prev => {
        const next = { ...prev }
        next[studentId] ??= {}
        next[studentId]![teacherId] ??= { first: null, second: null }
        next[studentId]![teacherId]![semester] = gradeValue
        return next
      })

      if (gradeValue === null && value !== '') return

      // One timer per cell — a second edit elsewhere must not cancel this save.
      schedule(`grade:${studentId}:${teacherId}:${semester}`, () => {
        void (async () => {
          try {
            await saveGrade(studentId, teacherId, semester, gradeValue)
            // Coalesce the status refresh: one GET per typing burst, not per
            // cell. It writes nothing, so it must not count as unsaved work —
            // otherwise every successful save was followed by half a second of
            // "Nicht gespeichert" and an unload warning with nothing pending.
            schedule('sokrates-refresh', () => void refreshSokrates?.(), { persists: false })
          } catch {
            setGrades(prev => {
              const next = { ...prev }
              next[studentId] ??= {}
              next[studentId]![teacherId] ??= { first: null, second: null }
              next[studentId]![teacherId]![semester] = previousValue
              return next
            })
            setError('Failed to save grade. Please try again.')
          }
        })()
      })
    },
    [grades, saveGrade, schedule, setError, setGrades, refreshSokrates],
  )

  const getGrade = useCallback(
    (studentId: number, teacherId: number, semester: Semester): number | null =>
      grades[studentId]?.[teacherId]?.[semester] ?? null,
    [grades],
  )

  const calculateAverage = useCallback(
    (studentId: number, semester: Semester, period?: Period) => {
      if (!classData) return null
      const teacherIds =
        period === 'AM'
          ? new Set(classData.amTeachers.map(teacher => teacher.id))
          : period === 'PM'
            ? new Set(classData.pmTeachers.map(teacher => teacher.id))
            : null
      return computeAverage(grades[studentId], semester, teacherIds)
    },
    [classData, grades],
  )

  /** Saved Endnote, or the sentinel implied by the semester average. */
  const getFinalGradeDisplay = useCallback(
    (studentId: number, semester: Semester): number | null => {
      const saved = finalGrades[studentId]?.[semester]
      if (saved != null) return saved
      const avg = calculateAverage(studentId, semester)
      if (avg === 'nicht beurteilt') return NICHT_BEURTEILT
      if (avg === 'gestunden') return GESTUNDEN
      return null
    },
    [finalGrades, calculateAverage],
  )

  const saveFinalGrade = useCallback(
    async (
      studentId: number,
      semester: Semester,
      grade: number | null,
      conductNoteWish?: string | null,
    ) => {
      if (!classData) return
      let ok = false
      try {
        beginRequest()
        const body: Record<string, unknown> = {
          studentId,
          classId: classData.id,
          semester,
          grade,
        }
        if (schoolYearId != null) body.schoolYearId = schoolYearId
        if (conductNoteWish !== undefined) {
          body.conductNoteWish = conductNoteWish === '' ? null : conductNoteWish
        }

        const response = await fetch('/api/notensammler/final-grades', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok) {
          const errorData = (await response.json()) as { error?: string }
          throw new Error(errorData.error ?? 'Failed to save final grade')
        }
        ok = true
      } catch (e) {
        captureFrontendError(e, { location: 'notensammler', type: 'save-final-grade' })
        throw e
      } finally {
        endRequest(ok)
      }
    },
    [beginRequest, classData, endRequest, schoolYearId],
  )

  const handleFinalGradeChange = useCallback(
    (studentId: number, semester: Semester, value: string) => {
      const gradeValue = parseFinalGradeInput(value)
      const previousValue = finalGrades[studentId]?.[semester] ?? null
      const conductWish =
        semester === 'first'
          ? (finalGrades[studentId]?.conductWishFirst ?? null)
          : (finalGrades[studentId]?.conductWishSecond ?? null)

      setFinalGrades(prev => {
        const next = { ...prev }
        next[studentId] ??= emptyFinalGrade()
        next[studentId]![semester] = gradeValue
        return next
      })

      if (gradeValue === null && value !== '') return

      schedule(`final:${studentId}:${semester}`, () => {
        void (async () => {
          try {
            await saveFinalGrade(studentId, semester, gradeValue, conductWish)
          } catch {
            setFinalGrades(prev => {
              const next = { ...prev }
              next[studentId] ??= emptyFinalGrade()
              next[studentId]![semester] = previousValue
              return next
            })
            setError('Failed to save final grade. Please try again.')
          }
        })()
      })
    },
    [finalGrades, saveFinalGrade, schedule, setError, setFinalGrades],
  )

  const handleConductWishChange = useCallback(
    (studentId: number, semester: Semester, value: string) => {
      // The sentinel keeps the Select showing "-"; the API stores null.
      const conductValue = value === '' || value === CONDUCT_NOTE_WISH_NONE ? null : value
      const stateValue = value === '' ? null : value
      const previousConduct =
        semester === 'first'
          ? (finalGrades[studentId]?.conductWishFirst ?? null)
          : (finalGrades[studentId]?.conductWishSecond ?? null)
      const gradeToSend = getFinalGradeDisplay(studentId, semester)

      setFinalGrades(prev => {
        const next = { ...prev }
        next[studentId] ??= emptyFinalGrade()
        if (semester === 'first') next[studentId]!.conductWishFirst = stateValue
        else next[studentId]!.conductWishSecond = stateValue
        return next
      })

      schedule(`conduct:${studentId}:${semester}`, () => {
        void (async () => {
          try {
            await saveFinalGrade(studentId, semester, gradeToSend, conductValue)
          } catch {
            setFinalGrades(prev => {
              const next = { ...prev }
              next[studentId] ??= emptyFinalGrade()
              if (semester === 'first') next[studentId]!.conductWishFirst = previousConduct
              else next[studentId]!.conductWishSecond = previousConduct
              return next
            })
            setError('Failed to save Betragensnote (Wunsch). Please try again.')
          }
        })()
      })
    },
    [finalGrades, getFinalGradeDisplay, saveFinalGrade, schedule, setError, setFinalGrades],
  )

  const saveAllGrades = useCallback(async () => {
    if (!classData) return

    try {
      setSavingAll(true)
      setError(null)

      // Everything is about to be written in bulk; pending per-cell saves
      // would only race with it.
      cancelAll()

      const gradesPayload: Array<{
        studentId: number
        teacherId: number
        semester: Semester
        grade: number | null
      }> = []
      for (const studentKey of Object.keys(grades)) {
        const studentId = parseInt(studentKey)
        const studentGrades = grades[studentId]
        if (!studentGrades) continue
        for (const teacherKey of Object.keys(studentGrades)) {
          const teacherId = parseInt(teacherKey)
          const teacherGrades = studentGrades[teacherId]
          if (!teacherGrades) continue
          gradesPayload.push(
            { studentId, teacherId, semester: 'first', grade: teacherGrades.first ?? null },
            { studentId, teacherId, semester: 'second', grade: teacherGrades.second ?? null },
          )
        }
      }

      const finalGradesPayload: Array<{
        studentId: number
        semester: Semester
        grade: number | null
        conductNoteWish: string | null
      }> = []
      // Both maps, not just `grades`: a student can carry an Endnote or a
      // Betragensnote wish without a single teacher mark, and iterating only
      // `grades` dropped those rows from "Alle speichern" entirely.
      const finalGradeStudentIds = new Set<number>()
      for (const key of [...Object.keys(grades), ...Object.keys(finalGrades)]) {
        const id = parseInt(key)
        if (!Number.isNaN(id)) finalGradeStudentIds.add(id)
      }
      for (const studentId of finalGradeStudentIds) {
        const forApi = (value: string | null) =>
          value === CONDUCT_NOTE_WISH_NONE || value === '' ? null : value

        for (const semester of ['first', 'second'] as const) {
          const grade = getFinalGradeDisplay(studentId, semester)
          const conduct =
            semester === 'first'
              ? (finalGrades[studentId]?.conductWishFirst ?? null)
              : (finalGrades[studentId]?.conductWishSecond ?? null)
          if (grade != null || conduct != null) {
            finalGradesPayload.push({
              studentId,
              semester,
              grade: grade ?? null,
              conductNoteWish: forApi(conduct),
            })
          }
        }
      }

      const batchBody = {
        classId: classData.id,
        ...(schoolYearId != null && { schoolYearId }),
      }

      // Both batch endpoints reject an oversized request outright. A class of
      // five groups with eight teachers is 960 grade rows against a ceiling of
      // 400, and 120 final-grade rows against a ceiling of 100 — so sending
      // the lot in one go failed the entire save with "Too many …".
      const postChunks = async <T>(
        url: string,
        key: 'grades' | 'finalGrades',
        rows: T[],
        chunkSize: number,
        fallbackMessage: string,
      ) => {
        const results: Array<{ skippedLocked?: number }> = []
        for (let start = 0; start < rows.length; start += chunkSize) {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...batchBody, [key]: rows.slice(start, start + chunkSize) }),
          })
          if (!response.ok) {
            const err = (await response.json().catch(() => null)) as { error?: string } | null
            throw new Error(err?.error ?? fallbackMessage)
          }
          results.push(
            ((await response.json().catch(() => null)) ?? {}) as { skippedLocked?: number },
          )
        }
        return results
      }

      const gradeResults = await postChunks(
        '/api/notensammler/grades/batch',
        'grades',
        gradesPayload,
        GRADES_CHUNK_SIZE,
        'Failed to save grades',
      )
      await postChunks(
        '/api/notensammler/final-grades/batch',
        'finalGrades',
        finalGradesPayload,
        FINAL_GRADES_CHUNK_SIZE,
        'Failed to save final grades',
      )

      // Some grades may have been skipped because they are locked in Sokrates —
      // the rest were still saved, so this is a notice, not a failure.
      const skippedLocked = gradeResults.reduce((sum, r) => sum + (r.skippedLocked ?? 0), 0)
      if (skippedLocked > 0) {
        setNotice?.(
          `${skippedLocked} in Sokrates gesperrte Note(n) wurden nicht gespeichert. Bitte den Klassenleiter kontaktieren.`,
        )
      }

      setSavedAt(Date.now())
      setSaveFailed(false)

      // Refresh so the per-class tab ticks reflect the new completion state.
      await refreshTeacherClasses()
      void refreshSokrates?.()
    } catch (e) {
      captureFrontendError(e, { location: 'notensammler', type: 'save-all-grades' })
      setSaveFailed(true)
      setError(e instanceof Error ? e.message : 'Failed to save all grades')
    } finally {
      setSavingAll(false)
    }
  }, [
    cancelAll,
    classData,
    finalGrades,
    getFinalGradeDisplay,
    grades,
    refreshTeacherClasses,
    refreshSokrates,
    schoolYearId,
    setError,
    setNotice,
  ])

  // Edits are still queued behind the debounce, or a request is in flight.
  // Leaving the page now would drop them.
  const hasUnsavedWork = pendingCount > 0 || saving || savingAll

  const saveState: SaveState = saveFailed
    ? 'error'
    : saving || savingAll
      ? 'saving'
      : pendingCount > 0
        ? 'pending'
        : savedAt != null
          ? 'saved'
          : 'idle'

  return {
    saving,
    savingAll,
    saveState,
    savedAt,
    hasUnsavedWork,
    handleGradeChange,
    getGrade,
    calculateAverage,
    getFinalGradeDisplay,
    handleFinalGradeChange,
    handleConductWishChange,
    saveAllGrades,
  }
}
