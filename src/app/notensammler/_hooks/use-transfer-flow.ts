import { useCallback, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { captureFrontendError } from '@/lib/frontend-error'
import { NmAuthRequiredError, NmError, nmRequest, type NmCredentials } from '@/lib/notenmanagement/client'
import { getStoredToken } from '@/lib/notenmanagement-token'
import { normalizeUsername } from '@/lib/username'
import type {
  EditableNote,
  Semester,
  TransferNoteOverride,
  TransferPreviewResponse,
  TransferResultResponse,
} from '@/lib/notenmanagement/types'
import type { ClassData } from '../_lib/types'

type Params = {
  classData: ClassData | null
  schoolYearId: number | undefined
  /** The semester the school is currently in; used as the default toggle. */
  currentSemester: Semester | null
  setError: (message: string | null) => void
  refreshClassData: () => Promise<void>
}

/**
 * Which dialog of the transfer flow is open; only one is ever shown.
 *
 * 'preview' opens immediately and loads a fully local preview (no login).
 * 'credentials' only appears when the actual write needs a fresh NM password.
 * 'result' shows what was sent.
 */
export type TransferStep = 'preview' | 'credentials' | 'result' | null

/**
 * The Notenmanagement transfer flow: preview-first, login-at-send.
 *
 * Opening loads the local preview without any Notenmanagement login. The write
 * needs credentials, but a cached bearer token skips the prompt. `overrides`
 * holds only the rows the teacher changed from their previewed Endnote — every
 * other student is sent with their stored value by the backend.
 */
export function useTransferFlow({
  classData,
  schoolYearId,
  currentSemester,
  setError,
  refreshClassData,
}: Params) {
  const { data: session } = useSession()

  const [step, setStep] = useState<TransferStep>(null)
  const [semester, setSemester] = useState<Semester>('first')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState<TransferPreviewResponse | null>(null)
  const [overrides, setOverrides] = useState<Record<number, EditableNote>>({})
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferResult, setTransferResult] = useState<TransferResultResponse | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [credentialsError, setCredentialsError] = useState<string | null>(null)
  // Guards against overlapping preview fetches: rapid semester toggling starts
  // multiple requests, and without this the last one to *resolve* (not the last
  // requested) would win, leaving previewData on the wrong semester.
  const previewReqRef = useRef(0)

  const fetchPreview = useCallback(
    async (forSemester: Semester) => {
      if (!classData) return
      const reqId = ++previewReqRef.current
      try {
        setPreviewLoading(true)
        setError(null)

        // Preview is fully local — deliberately no credentials are sent.
        const res = await fetch('/api/notensammler/transfer/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId: classData.id,
            semester: forSemester,
            ...(schoolYearId != null && { schoolYearId }),
          }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? 'Failed to build transfer preview')
        }
        const preview = (await res.json()) as TransferPreviewResponse

        // A newer toggle superseded this request — drop its (stale) result.
        if (reqId !== previewReqRef.current) return
        setPreviewData(preview)
        // Switching semester discards any overrides from the previous one, since
        // they were relative to a different set of previewed marks.
        setOverrides({})
      } catch (e) {
        if (reqId !== previewReqRef.current) return
        captureFrontendError(e, { location: 'notensammler', type: 'notenmanagement-preview' })
        setError(e instanceof Error ? e.message : 'Failed to build transfer preview')
      } finally {
        if (reqId === previewReqRef.current) setPreviewLoading(false)
      }
    },
    [classData, schoolYearId, setError],
  )

  const open = useCallback(() => {
    if (!classData) return
    setTransferResult(null)
    setPreviewData(null)
    setOverrides({})
    setUsername(session?.user?.name ?? '')
    setPassword('')
    setCredentialsError(null)
    const initial = currentSemester ?? 'first'
    setSemester(initial)
    setStep('preview')
    void fetchPreview(initial)
  }, [classData, currentSemester, fetchPreview, session?.user?.name])

  const close = useCallback(() => {
    setStep(null)
    setPassword('')
    setCredentialsError(null)
    setPreviewData(null)
    setOverrides({})
  }, [])

  const selectSemester = useCallback(
    (forSemester: Semester) => {
      if (forSemester === semester && previewData) return
      setSemester(forSemester)
      void fetchPreview(forSemester)
    },
    [fetchPreview, previewData, semester],
  )

  /** Record an override only when it differs from the row's previewed value. */
  const setOverride = useCallback(
    (studentId: number, value: EditableNote) => {
      const student = previewData?.students.find(s => s.studentId === studentId)
      const previewed: EditableNote | null =
        student?.note ?? student?.nullNoteLabel ?? null
      setOverrides(prev => {
        const next = { ...prev }
        if (previewed !== null && value === previewed) {
          delete next[studentId]
        } else {
          next[studentId] = value
        }
        return next
      })
    },
    [previewData],
  )

  const sendTransfer = useCallback(
    async (credentials: NmCredentials) => {
      if (!classData || !previewData) return
      try {
        setTransferLoading(true)
        setError(null)

        // Only overridden rows travel as `notes`; the rest use their stored Endnote.
        const notes: TransferNoteOverride[] = Object.entries(overrides).map(([id, note]) => ({
          studentId: Number(id),
          note: typeof note === 'number' ? note : null,
          ...(typeof note === 'number' ? {} : { nullNoteReason: note }),
        }))

        const result = await nmRequest<TransferResultResponse>(
          '/api/notensammler/transfer',
          {
            classId: classData.id,
            groupId: null,
            semester: previewData.semester,
            ...(schoolYearId != null && { schoolYearId }),
            notes,
          },
          credentials,
        )

        setTransferResult(result)
        setPassword('')
        setCredentialsError(null)
        setStep('result')

        // Refresh so the "Übertragen" badge and LF id appear without a reload.
        await refreshClassData()
      } catch (e) {
        // A stale cached token with no password to retry — ask for one.
        if (e instanceof NmAuthRequiredError) {
          setCredentialsError(null)
          setStep('credentials')
          return
        }
        // Wrong Notenmanagement password — reopen the prompt with a message.
        if (e instanceof NmError && e.status === 401) {
          setCredentialsError('NM-Login fehlgeschlagen. Bitte Passwort prüfen.')
          setStep('credentials')
          return
        }
        captureFrontendError(e, { location: 'notensammler', type: 'notenmanagement-transfer' })
        setError(e instanceof Error ? e.message : 'Failed to transfer')
      } finally {
        setTransferLoading(false)
      }
    },
    [classData, overrides, previewData, refreshClassData, schoolYearId, setError],
  )

  /** Primary "übertragen" action: send straight away if a token is cached. */
  const submit = useCallback(() => {
    if (!previewData || previewData.counts.readyToSend === 0) return

    const sessionName = session?.user?.name ?? ''
    const normalized = normalizeUsername(sessionName)
    const stored = getStoredToken()
    if (stored && normalizeUsername(stored.username) === normalized) {
      void sendTransfer({ username: sessionName, token: stored.token })
      return
    }

    setUsername(sessionName)
    setPassword('')
    setCredentialsError(null)
    setStep('credentials')
  }, [previewData, sendTransfer, session?.user?.name])

  const submitCredentials = useCallback(() => {
    if (!username || !password) return
    void sendTransfer({ username, password })
  }, [password, sendTransfer, username])

  return {
    step,
    setStep,
    open,
    close,
    semester,
    selectSemester,
    previewLoading,
    previewData,
    overrides,
    setOverride,
    transferLoading,
    transferResult,
    submit,
    username,
    setUsername,
    password,
    setPassword,
    credentialsError,
    submitCredentials,
  }
}
