import { useCallback, useEffect, useRef, useState } from 'react'
import { useEntitlements } from '@/contexts/entitlements-context'
import { useKeyedDebounce } from '@/hooks/use-keyed-debounce'
import type { SaveState } from '@/components/save-status'
import { captureFrontendError } from '@/lib/frontend-error'
import { entryKey } from '@/lib/grades'
import {
  DEFAULT_WEIGHTS,
  emptyEntry,
  type FinalGradePerStudent,
  type NotenEntryRow,
  type Student,
  type TeachingDay,
  type WeightConfig,
} from '../_lib/types'

type Params = {
  classId: number | null
  groupId: number | null
  schoolYearId: number | null
}

/**
 * Rows per request. `/api/noten/entries` upserts one row at a time inside the
 * handler, so a whole term in a single body is a request that never returns.
 */
const ENTRY_CHUNK_SIZE = 100

/** A seat plan is typed, not picked — one PATCH per keystroke is not a save. */
const SITZPLATZ_DEBOUNCE_MS = 600

/** How long "Gespeichert" stays up before the indicator goes quiet again. */
const SAVED_LINGER_MS = 2000

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Everything the grid reads and writes for one class/group: teaching days,
 * students, per-day entries, weighting, Lehrstoff and final grades.
 *
 * Every write reports through one save indicator. Grade saves used to be fired
 * as bare `void` promises whose rejection nobody handled, so a failed write
 * left the mark on screen looking entered — reloading the page was the first
 * anyone heard of it.
 */
export function useNotenData({ classId, groupId, schoolYearId }: Params) {
  const { isFeatureEnabled } = useEntitlements()

  const [teachingDays, setTeachingDays] = useState<TeachingDay[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [entries, setEntries] = useState<Record<string, NotenEntryRow>>({})
  const [weightConfig, setWeightConfig] = useState<WeightConfig | null>(null)
  const [lehrstoffByDay, setLehrstoffByDay] = useState<Record<string, string>>({})
  const [finalGrades, setFinalGrades] = useState<Record<number, FinalGradePerStudent>>({})
  const [teacherId, setTeacherId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // Final-grade selects save on close, by which time state may have moved on;
  // the ref gives the handler the current value rather than a captured one.
  const finalGradesRef = useRef<Record<number, FinalGradePerStudent>>({})
  finalGradesRef.current = finalGrades
  // "Speichern" re-sends what is still unwritten, so it needs the entries as
  // they are now, not as they were when the callback was created.
  const entriesRef = useRef<Record<string, NotenEntryRow>>({})
  entriesRef.current = entries

  /**
   * Keys whose value has not reached the server. A failed autosave leaves its
   * key here, which is what makes "Speichern" a retry rather than a no-op.
   */
  const dirtyRef = useRef<Set<string>>(new Set())
  const [dirtyCount, setDirtyCount] = useState(0)

  const inFlightRef = useRef(0)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { schedule, flushAll, pendingCount } = useKeyedDebounce(SITZPLATZ_DEBOUNCE_MS)

  const beginSave = useCallback(() => {
    inFlightRef.current += 1
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setSaveState('saving')
  }, [])

  const endSave = useCallback((ok: boolean) => {
    inFlightRef.current = Math.max(0, inFlightRef.current - 1)
    if (!ok) {
      setSaveState('error')
      return
    }
    // Another request may still be running; let the last one report.
    if (inFlightRef.current > 0) return
    setSaveState(dirtyRef.current.size > 0 ? 'pending' : 'saved')
    savedTimerRef.current = setTimeout(
      () => setSaveState(current => (current === 'saved' ? 'idle' : current)),
      SAVED_LINGER_MS,
    )
  }, [])

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    },
    [],
  )

  const markDirty = useCallback((keys: string[]) => {
    for (const key of keys) dirtyRef.current.add(key)
    setDirtyCount(dirtyRef.current.size)
  }, [])

  const markClean = useCallback((keys: string[]) => {
    for (const key of keys) dirtyRef.current.delete(key)
    setDirtyCount(dirtyRef.current.size)
  }, [])

  useEffect(() => {
    if (classId == null || groupId == null || !schoolYearId) {
      setTeachingDays([])
      setStudents([])
      setWeightConfig(null)
      setLehrstoffByDay({})
      setEntries({})
      setFinalGrades({})
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadError(null)
    // Anything still queued belongs to the group being left behind, and is
    // written for it rather than dropped — switching groups is not a discard.
    flushAll()
    dirtyRef.current.clear()
    setDirtyCount(0)
    const query = `classId=${classId}&groupId=${groupId}&schoolYearId=${schoolYearId}`

    void Promise.all([
      fetch(`/api/noten/teaching-days?${query}`),
      fetch(`/api/noten/students?${query}`),
      fetch(`/api/noten/data?${query}`),
    ])
      .then(async ([daysRes, studentsRes, dataRes]) => {
        if (cancelled) return
        // Without this the failing response was parsed as data and the grid
        // rendered as a class with no students rather than as an error.
        if (!daysRes.ok || !studentsRes.ok || !dataRes.ok) {
          throw new Error('Load failed')
        }
        const [daysData, studentsData, notenData] = await Promise.all([
          daysRes.json() as Promise<{ teachingDays?: TeachingDay[] }>,
          studentsRes.json() as Promise<{ students?: Student[] }>,
          dataRes.json() as Promise<{
            weightConfig: WeightConfig | null
            lehrstoffByDay: Record<string, string>
            finalGrades?: Record<number, FinalGradePerStudent>
            teacherId?: number
            entries: NotenEntryRow[]
          }>,
        ])
        if (cancelled) return

        setTeachingDays(daysData.teachingDays ?? [])
        setStudents(studentsData.students ?? [])
        setWeightConfig(notenData.weightConfig ?? null)
        setLehrstoffByDay(notenData.lehrstoffByDay ?? {})
        setFinalGrades(notenData.finalGrades ?? {})
        setTeacherId(notenData.teacherId ?? null)

        const entriesMap: Record<string, NotenEntryRow> = {}
        for (const entry of notenData.entries ?? []) {
          entriesMap[entryKey(entry.studentId, entry.date, entry.period)] = entry
        }
        setEntries(entriesMap)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        captureFrontendError(err, { location: 'noten', type: 'load-class-data' })
        setLoadError('Die Daten dieser Gruppe konnten nicht geladen werden.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [classId, groupId, schoolYearId, flushAll])

  const updateEntry = useCallback(
    (studentId: number, date: string, period: string, patch: Partial<NotenEntryRow>) => {
      const key = entryKey(studentId, date, period)
      setEntries(prev => ({
        ...prev,
        [key]: { ...emptyEntry(studentId, date, period), ...prev[key], ...patch },
      }))
      markDirty([key])
    },
    [markDirty],
  )

  const saveEntries = useCallback(
    async (payload: NotenEntryRow[], options?: { silent?: boolean }) => {
      if (classId == null || groupId == null || !schoolYearId) return false
      if (payload.length === 0) return true
      const keys = payload.map(e => entryKey(e.studentId, e.date, e.period))
      // Chunks are cleared together at the end: a later chunk failing must not
      // put the rows an earlier one already wrote back into the retry set.
      const written = new Set<string>()
      if (!options?.silent) beginSave()
      try {
        for (const part of chunk(payload, ENTRY_CHUNK_SIZE)) {
          const res = await fetch('/api/noten/entries', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classId, groupId, schoolYearId, entries: part }),
          })
          if (!res.ok) throw new Error('Save failed')
          for (const entry of part) written.add(entryKey(entry.studentId, entry.date, entry.period))
        }
        markClean([...written])
        setSaveError(null)
        if (!options?.silent) endSave(true)
        return true
      } catch (err) {
        captureFrontendError(err, { location: 'noten', type: 'save-entries' })
        markClean([...written])
        markDirty(keys.filter(key => !written.has(key)))
        setSaveError('Die Eingabe konnte nicht gespeichert werden.')
        if (!options?.silent) endSave(false)
        return false
      }
    },
    [classId, groupId, schoolYearId, beginSave, endSave, markClean, markDirty],
  )

  const weights = weightConfig ?? DEFAULT_WEIGHTS
  const weightSum =
    weights.weightWiederholung +
    weights.weightBericht +
    weights.weightMitarbeit +
    weights.weightPraktischeArbeit
  const weightsValid = weightSum === 100

  const saveWeights = useCallback(
    async (options?: { silent?: boolean }) => {
      if (classId == null || groupId == null || !schoolYearId || !weightConfig) return true
      // The server rejects a split that does not add up; don't bother asking.
      if (!weightsValid) return true
      if (!options?.silent) beginSave()
      try {
        const res = await fetch('/api/noten/weights', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, groupId, schoolYearId, ...weightConfig }),
        })
        if (!res.ok) throw new Error('Save failed')
        setSaveError(null)
        if (!options?.silent) endSave(true)
        return true
      } catch (err) {
        captureFrontendError(err, { location: 'noten', type: 'save-weights' })
        setSaveError('Die Gewichtung konnte nicht gespeichert werden.')
        if (!options?.silent) endSave(false)
        return false
      }
    },
    [classId, groupId, schoolYearId, weightConfig, weightsValid, beginSave, endSave],
  )

  const saveLehrstoff = useCallback(
    async (date: string, period: string, value: string, options?: { silent?: boolean }) => {
      if (classId == null || groupId == null || !schoolYearId) return false
      if (!options?.silent) beginSave()
      try {
        const res = await fetch('/api/noten/lehrstoff', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, groupId, schoolYearId, date, period, lehrstoff: value }),
        })
        // The response used to go unread, so a rejected Lehrstoff looked saved.
        if (!res.ok) throw new Error('Save failed')
        setSaveError(null)
        if (!options?.silent) endSave(true)
        return true
      } catch (err) {
        captureFrontendError(err, { location: 'noten', type: 'save-lehrstoff' })
        setSaveError('Der Lehrstoff konnte nicht gespeichert werden.')
        if (!options?.silent) endSave(false)
        return false
      }
    },
    [classId, groupId, schoolYearId, beginSave, endSave],
  )

  const setFinalGrade = useCallback(
    (
      studentId: number,
      semester: 'first' | 'second',
      field: 'grade' | 'conductNoteWish',
      value: number | string | null,
    ) => {
      setFinalGrades(prev => {
        const current = prev[studentId] ?? {
          first: { grade: null, conductNoteWish: null },
          second: { grade: null, conductNoteWish: null },
        }
        return {
          ...prev,
          [studentId]: { ...current, [semester]: { ...current[semester], [field]: value } },
        }
      })
    },
    [],
  )

  const saveFinalGrades = useCallback(
    async (
      payload: Array<{
        studentId: number
        semester: 'first' | 'second'
        grade: number | null
        conductNoteWish: string | null
      }>,
      options?: { silent?: boolean },
    ) => {
      if (classId == null || !schoolYearId) return false
      if (!options?.silent) beginSave()
      try {
        // With Notensammler licensed, marks live there and only the
        // Betragensnote stays local; otherwise everything is stored here.
        const useNotensammler = isFeatureEnabled('notensammler')
        if (useNotensammler) {
          // The mark half of the save needs the teacher's Notensammler id;
          // without it we'd silently drop the grades, so fail loudly instead.
          if (teacherId == null) {
            throw new Error(
              'Notensammler-Lehrer-ID fehlt; Endnote konnte nicht gespeichert werden.',
            )
          }
          const gradesRes = await fetch('/api/notensammler/grades/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              classId,
              schoolYearId,
              grades: payload.map(p => ({
                studentId: p.studentId,
                teacherId,
                semester: p.semester,
                grade: p.grade,
              })),
            }),
          })
          if (!gradesRes.ok) throw new Error('Save grades failed')

          const conductRes = await fetch('/api/noten/conduct', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              classId,
              schoolYearId,
              updates: payload.map(p => ({
                studentId: p.studentId,
                semester: p.semester,
                conductNoteWish: p.conductNoteWish,
              })),
            }),
          })
          if (!conductRes.ok) throw new Error('Save conduct failed')
        } else {
          const res = await fetch('/api/noten/final-grades', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classId, schoolYearId, finalGrades: payload }),
          })
          if (!res.ok) throw new Error('Save final grades failed')
        }
        setSaveError(null)
        if (!options?.silent) endSave(true)
        return true
      } catch (err) {
        captureFrontendError(err, { location: 'noten', type: 'save-final-grades' })
        setSaveError(err instanceof Error ? err.message : 'Save failed')
        if (!options?.silent) endSave(false)
        return false
      }
    },
    [classId, schoolYearId, teacherId, isFeatureEnabled, beginSave, endSave],
  )

  const setAllAnwesend = useCallback(
    async (date: string, period: string) => {
      if (classId == null || groupId == null || !schoolYearId) return
      beginSave()
      try {
        const res = await fetch('/api/noten/set-attendance-day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, groupId, schoolYearId, date, period }),
        })
        if (!res.ok) throw new Error('Save failed')
        // The server wrote the rows; mirror them locally without re-dirtying.
        setEntries(prev => {
          const next = { ...prev }
          for (const student of students) {
            const key = entryKey(student.id, date, period)
            next[key] = {
              ...emptyEntry(student.id, date, period),
              ...next[key],
              attendance: 'Anwesend',
            }
          }
          return next
        })
        setSaveError(null)
        endSave(true)
      } catch (err) {
        captureFrontendError(err, { location: 'noten', type: 'set-all-anwesend' })
        setSaveError('Die Anwesenheit konnte nicht gespeichert werden.')
        endSave(false)
      }
    },
    [classId, groupId, schoolYearId, students, beginSave, endSave],
  )

  const writeSitzplatz = useCallback(
    async (studentId: number, sitzplatz: string | null) => {
      beginSave()
      try {
        const res = await fetch('/api/noten/student-sitzplatz', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, sitzplatz }),
        })
        if (!res.ok) throw new Error('Save failed')
        setSaveError(null)
        endSave(true)
      } catch (err) {
        captureFrontendError(err, { location: 'noten', type: 'save-sitzplatz' })
        setSaveError('Der Sitzplatz konnte nicht gespeichert werden.')
        endSave(false)
      }
    },
    [beginSave, endSave],
  )

  const updateSitzplatz = useCallback(
    (studentId: number, sitzplatz: string | null) => {
      // Optimistic: the field should stay responsive while the request runs.
      setStudents(prev =>
        prev.map(student => (student.id === studentId ? { ...student, sitzplatz } : student)),
      )
      schedule(`sitzplatz:${studentId}`, () => void writeSitzplatz(studentId, sitzplatz))
    },
    [schedule, writeSitzplatz],
  )

  /**
   * Write everything that has not reached the server yet.
   *
   * This used to post one row per student *per teaching day* — the full
   * cartesian product, blank cells included — into a handler that upserts
   * sequentially. On a class with a term behind it that is thousands of writes
   * per click, most of them creating empty rows. Only what is actually
   * outstanding is sent now.
   */
  const saveAll = useCallback(async () => {
    if (classId == null || groupId == null || !schoolYearId) return
    // Anything sitting in a debounce is unsaved work too.
    flushAll()

    const outstanding = [...dirtyRef.current]
      .map(key => entriesRef.current[key])
      .filter((entry): entry is NotenEntryRow => entry != null)

    beginSave()
    const results = await Promise.all([
      saveEntries(outstanding, { silent: true }),
      saveWeights({ silent: true }),
    ])
    endSave(results.every(Boolean))
  }, [classId, groupId, schoolYearId, flushAll, saveEntries, saveWeights, beginSave, endSave])

  return {
    teachingDays,
    students,
    entries,
    weightConfig,
    setWeightConfig,
    weights,
    weightsValid,
    lehrstoffByDay,
    setLehrstoffByDay,
    finalGrades,
    finalGradesRef,
    loading,
    loadError,
    saveState,
    saveError,
    setSaveError,
    /** Edits the tab could still lose: unwritten cells plus queued debounces. */
    hasUnsavedWork: dirtyCount > 0 || pendingCount > 0,
    updateEntry,
    saveEntries,
    saveWeights,
    saveLehrstoff,
    setFinalGrade,
    saveFinalGrades,
    setAllAnwesend,
    updateSitzplatz,
    saveAll,
  }
}
