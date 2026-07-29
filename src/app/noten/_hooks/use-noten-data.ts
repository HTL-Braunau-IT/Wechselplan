import { useCallback, useEffect, useRef, useState } from 'react'
import { useEntitlements } from '@/contexts/entitlements-context'
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
 * Everything the grid reads and writes for one class/group: teaching days,
 * students, per-day entries, weighting, Lehrstoff and final grades.
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
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Final-grade selects save on close, by which time state may have moved on;
  // the ref gives the handler the current value rather than a captured one.
  const finalGradesRef = useRef<Record<number, FinalGradePerStudent>>({})
  finalGradesRef.current = finalGrades

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
    const query = `classId=${classId}&groupId=${groupId}&schoolYearId=${schoolYearId}`

    void Promise.all([
      fetch(`/api/noten/teaching-days?${query}`),
      fetch(`/api/noten/students?${query}`),
      fetch(`/api/noten/data?${query}`),
    ])
      .then(async ([daysRes, studentsRes, dataRes]) => {
        if (cancelled) return
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
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [classId, groupId, schoolYearId])

  const updateEntry = useCallback(
    (studentId: number, date: string, period: string, patch: Partial<NotenEntryRow>) => {
      const key = entryKey(studentId, date, period)
      setEntries(prev => ({
        ...prev,
        [key]: { ...emptyEntry(studentId, date, period), ...prev[key], ...patch },
      }))
    },
    [],
  )

  const saveEntries = useCallback(
    async (payload: NotenEntryRow[], options?: { skipSaving?: boolean }) => {
      if (classId == null || groupId == null || !schoolYearId) return
      if (!options?.skipSaving) setSaving(true)
      try {
        const res = await fetch('/api/noten/entries', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, groupId, schoolYearId, entries: payload }),
        })
        if (!res.ok) throw new Error('Save failed')
      } finally {
        if (!options?.skipSaving) setSaving(false)
      }
    },
    [classId, groupId, schoolYearId],
  )

  const weights = weightConfig ?? DEFAULT_WEIGHTS
  const weightSum =
    weights.weightWiederholung +
    weights.weightBericht +
    weights.weightMitarbeit +
    weights.weightPraktischeArbeit
  const weightsValid = weightSum === 100

  const saveWeights = useCallback(
    async (options?: { skipSaving?: boolean }) => {
      if (classId == null || groupId == null || !schoolYearId || !weightConfig) return
      // The server rejects a split that does not add up; don't bother asking.
      if (!weightsValid) return
      if (!options?.skipSaving) setSaving(true)
      try {
        const res = await fetch('/api/noten/weights', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, groupId, schoolYearId, ...weightConfig }),
        })
        if (!res.ok) throw new Error('Save failed')
      } finally {
        if (!options?.skipSaving) setSaving(false)
      }
    },
    [classId, groupId, schoolYearId, weightConfig, weightsValid],
  )

  const saveLehrstoff = useCallback(
    async (date: string, period: string, value: string, options?: { skipSaving?: boolean }) => {
      if (classId == null || groupId == null || !schoolYearId) return
      if (!options?.skipSaving) setSaving(true)
      try {
        await fetch('/api/noten/lehrstoff', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId,
            groupId,
            schoolYearId,
            date,
            period,
            lehrstoff: value,
          }),
        })
      } finally {
        if (!options?.skipSaving) setSaving(false)
      }
    },
    [classId, groupId, schoolYearId],
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
      options?: { skipSaving?: boolean },
    ) => {
      if (classId == null || !schoolYearId) return
      if (!options?.skipSaving) setSaving(true)
      setSaveError(null)
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
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed')
      } finally {
        if (!options?.skipSaving) setSaving(false)
      }
    },
    [classId, schoolYearId, teacherId, isFeatureEnabled],
  )

  const setAllAnwesend = useCallback(
    async (date: string, period: string) => {
      if (classId == null || groupId == null || !schoolYearId) return
      setSaving(true)
      try {
        const res = await fetch('/api/noten/set-attendance-day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, groupId, schoolYearId, date, period }),
        })
        if (!res.ok) return
        students.forEach(student =>
          updateEntry(student.id, date, period, { attendance: 'Anwesend' }),
        )
      } finally {
        setSaving(false)
      }
    },
    [classId, groupId, schoolYearId, students, updateEntry],
  )

  const updateSitzplatz = useCallback(async (studentId: number, sitzplatz: string | null) => {
    // Optimistic: the field should stay responsive while the request runs.
    setStudents(prev =>
      prev.map(student => (student.id === studentId ? { ...student, sitzplatz } : student)),
    )
    try {
      await fetch('/api/noten/student-sitzplatz', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, sitzplatz }),
      })
    } catch {
      // Non-fatal: the seat plan is cosmetic and reloads from the server.
    }
  }, [])

  /** Persist every entry, Lehrstoff and the weighting in one go. */
  const saveAll = useCallback(async () => {
    if (classId == null || groupId == null || !schoolYearId) return

    const allEntries: NotenEntryRow[] = students.flatMap(student =>
      teachingDays.map(
        day =>
          entries[entryKey(student.id, day.date, day.period)] ??
          emptyEntry(student.id, day.date, day.period),
      ),
    )

    setSaveError(null)
    setSaving(true)
    try {
      await saveEntries(allEntries, { skipSaving: true })
      await Promise.all(
        teachingDays.map(day =>
          saveLehrstoff(day.date, day.period, lehrstoffByDay[`${day.date}-${day.period}`] ?? '', {
            skipSaving: true,
          }),
        ),
      )
      if (weightsValid) await saveWeights({ skipSaving: true })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [
    classId,
    groupId,
    schoolYearId,
    students,
    teachingDays,
    entries,
    lehrstoffByDay,
    weightsValid,
    saveEntries,
    saveLehrstoff,
    saveWeights,
  ])

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
    saving,
    saveError,
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
