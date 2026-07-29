import { useCallback, useState } from 'react'
import { useSession } from 'next-auth/react'
import { NmAuthRequiredError, nmRequest } from '@/lib/notenmanagement/client'
import { getStoredToken } from '@/lib/notenmanagement-token'
import { normalizeUsername } from '@/lib/username'
import type { Student } from '../_lib/types'

/**
 * Notenmanagement transfer for the Noten page, for one group or for every group
 * in the class.
 *
 * These were two separate flows with 17 state variables between them and their
 * fetch/retry logic written inline inside JSX onClick handlers. They only ever
 * differed in how many groups they walked, so this hook models the group case
 * as a single-element list and shares everything else.
 */

export type TransferMode = 'group' | 'all'
export type TransferStep = 'semester' | 'list' | null
type Semester = 'first' | 'second'

/** One group's students plus the marks proposed for them. */
export type TransferGroup = { groupId: number; students: Student[] }

type PrefillResponse = {
  students: Student[]
  prefill: Record<number, { first: number | null; second: number | null }>
}

type Params = {
  classId: number | null
  schoolYearId: number | null
  /** Group currently open in the grid, used when mode is 'group'. */
  selectedGroupId: number | null
  /** Every group of the selected class, used when mode is 'all'. */
  allGroupIds: number[]
}

export function useNmTransfer({ classId, schoolYearId, selectedGroupId, allGroupIds }: Params) {
  const { data: session } = useSession()

  const [mode, setMode] = useState<TransferMode>('group')
  const [step, setStep] = useState<TransferStep>(null)
  const [semester, setSemester] = useState<Semester | null>(null)
  const [groups, setGroups] = useState<TransferGroup[]>([])
  const [grades, setGrades] = useState<Record<number, number | null>>({})
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const start = useCallback((forMode: TransferMode) => {
    setMode(forMode)
    setStep('semester')
    setSemester(null)
    setError(null)
  }, [])

  const close = useCallback(() => {
    setStep(null)
    setSemester(null)
    setGroups([])
    setGrades({})
    setExcluded(new Set())
    setError(null)
  }, [])

  /** Load proposed marks for every group in scope and move to the review step. */
  const selectSemester = useCallback(
    async (forSemester: Semester) => {
      if (!classId || !schoolYearId) return
      const groupIds =
        mode === 'group' ? (selectedGroupId != null ? [selectedGroupId] : []) : allGroupIds
      if (groupIds.length === 0) return

      setSemester(forSemester)
      setError(null)

      try {
        const results = await Promise.all(
          groupIds.map(async groupId => {
            const res = await fetch(
              `/api/noten/transfer-prefill?classId=${classId}&schoolYearId=${schoolYearId}&groupId=${groupId}`,
            )
            if (!res.ok) return { groupId, ok: false as const }
            const data = (await res.json()) as PrefillResponse
            return {
              groupId,
              ok: true as const,
              students: data.students,
              prefill: data.prefill ?? {},
            }
          }),
        )

        const loadedGroups: TransferGroup[] = []
        const proposed: Record<number, number | null> = {}
        const failed: number[] = []

        for (const result of results) {
          if (!result.ok) {
            failed.push(result.groupId)
            continue
          }
          loadedGroups.push({ groupId: result.groupId, students: result.students })
          for (const student of result.students) {
            // Notenmanagement only accepts whole marks.
            const value = result.prefill[student.id]?.[forSemester]
            proposed[student.id] = value == null ? null : Math.round(value)
          }
        }

        setGroups(loadedGroups)
        setGrades(proposed)
        setExcluded(new Set())
        if (failed.length > 0) {
          setError(`Gruppen konnten nicht geladen werden: ${failed.join(', ')}`)
        }
        setStep('list')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed')
      }
    },
    [classId, schoolYearId, mode, selectedGroupId, allGroupIds],
  )

  const setGrade = useCallback((studentId: number, grade: number | null) => {
    setGrades(prev => ({ ...prev, [studentId]: grade }))
  }, [])

  const toggleExcluded = useCallback((studentId: number, included: boolean) => {
    setExcluded(prev => {
      const next = new Set(prev)
      if (included) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }, [])

  const submit = useCallback(async () => {
    if (!classId || !schoolYearId || !semester) return

    const defaultUsername = typeof session?.user?.name === 'string' ? session.user.name : ''
    const effectiveUsername = username || defaultUsername
    if (!effectiveUsername) {
      setError('Notenmanagement-Benutzername erforderlich.')
      return
    }

    // Without a cached token for this user we need a password before starting.
    const storedToken = getStoredToken()
    const hasUsableToken =
      storedToken != null &&
      normalizeUsername(storedToken.username) === normalizeUsername(effectiveUsername)
    if (!hasUsableToken && !password) {
      setUsername(defaultUsername)
      setShowPasswordDialog(true)
      return
    }

    const payloads = groups
      .map(group => ({
        groupId: group.groupId,
        notes: group.students
          .filter(student => !excluded.has(student.id))
          .map(student => ({ studentId: student.id, note: grades[student.id] ?? null })),
      }))
      // A group where every student was unchecked has nothing to send.
      .filter(group => group.notes.length > 0)

    if (payloads.length === 0) {
      setError('Keine Schüler zum Übertragen ausgewählt.')
      return
    }

    setSaving(true)
    setError(null)

    const failed: number[] = []
    try {
      for (const payload of payloads) {
        try {
          await nmRequest(
            '/api/notensammler/transfer',
            {
              classId,
              groupId: payload.groupId,
              semester,
              schoolYearId,
              notes: payload.notes,
              notesByMatrikelnummer: [],
            },
            { username: effectiveUsername, password: password || undefined },
          )
        } catch (e) {
          if (e instanceof NmAuthRequiredError) throw e
          failed.push(payload.groupId)
        }
      }

      if (failed.length > 0) {
        setError(`Übertragung fehlgeschlagen für Gruppe(n): ${failed.join(', ')}`)
        return
      }

      setShowPasswordDialog(false)
      setPassword('')
      close()
    } catch (e) {
      if (e instanceof NmAuthRequiredError) {
        setUsername(defaultUsername)
        setShowPasswordDialog(true)
        return
      }
      setError(e instanceof Error ? e.message : 'Transfer failed')
    } finally {
      setSaving(false)
    }
  }, [
    classId,
    schoolYearId,
    semester,
    session?.user?.name,
    username,
    password,
    groups,
    excluded,
    grades,
    close,
  ])

  return {
    mode,
    step,
    semester,
    groups,
    grades,
    excluded,
    saving,
    error,
    showPasswordDialog,
    setShowPasswordDialog,
    username,
    setUsername,
    password,
    setPassword,
    start,
    close,
    selectSemester,
    setGrade,
    toggleExcluded,
    submit,
  }
}
