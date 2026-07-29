import { useCallback, useState } from 'react'
import { useSession } from 'next-auth/react'
import { captureFrontendError } from '@/lib/frontend-error'
import { nmRequest } from '@/lib/notenmanagement/client'
import type {
	EditableNote,
	Semester,
	TransferPreviewResponse,
	TransferResultResponse
} from '@/lib/notenmanagement/types'
import type { ClassData } from '../_lib/types'

type Params = {
	classData: ClassData | null
	schoolYearId: number | undefined
	setError: (message: string | null) => void
	refreshClassData: () => Promise<void>
}

/** Step in the transfer wizard; only one dialog is ever open. */
type TransferStep = 'password' | 'semester' | 'preview' | 'result' | null

/**
 * The Notenmanagement transfer wizard: credentials, semester, editable preview,
 * result. Four booleans used to track which dialog was open, which allowed
 * states like "preview and result both showing"; a single step makes that
 * unrepresentable.
 */
export function useTransferFlow({ classData, schoolYearId, setError, refreshClassData }: Params) {
	const { data: session } = useSession()

	const [step, setStep] = useState<TransferStep>(null)
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [semester, setSemester] = useState<Semester | null>(null)
	const [previewLoading, setPreviewLoading] = useState(false)
	const [transferLoading, setTransferLoading] = useState(false)
	const [previewData, setPreviewData] = useState<TransferPreviewResponse | null>(null)
	const [editedNotes, setEditedNotes] = useState<Record<number, EditableNote>>({})
	const [editedNotesNmOnly, setEditedNotesNmOnly] = useState<
		Record<number, 1 | 2 | 3 | 4 | 5 | null>
	>({})
	const [transferResult, setTransferResult] = useState<TransferResultResponse | null>(null)

	const open = useCallback(() => {
		if (!classData) return
		setTransferResult(null)
		setPreviewData(null)
		setEditedNotes({})
		setEditedNotesNmOnly({})
		setSemester(null)
		setUsername(session?.user?.name ?? '')
		setPassword('')
		setStep('password')
	}, [classData, session?.user?.name])

	const close = useCallback(() => {
		setStep(null)
		setPassword('')
		setSemester(null)
		setPreviewData(null)
		setEditedNotes({})
	}, [])

	const fetchPreview = useCallback(
		async (forSemester: Semester) => {
			if (!classData) return
			try {
				setPreviewLoading(true)
				setError(null)

				const preview = await nmRequest<TransferPreviewResponse>(
					'/api/notensammler/transfer/preview',
					{
						classId: classData.id,
						semester: forSemester,
						...(schoolYearId != null && { schoolYearId })
					},
					{ username, password }
				)

				setPreviewData(preview)
				setEditedNotes(
					Object.fromEntries(
						preview.students.map((student) => [
							student.studentId,
							student.note ?? student.nullNoteLabel ?? 'Nicht beurteilt'
						])
					)
				)
				setStep('preview')
			} catch (e) {
				captureFrontendError(e, { location: 'notensammler', type: 'notenmanagement-preview' })
				setError(e instanceof Error ? e.message : 'Failed to build transfer preview')
			} finally {
				setPreviewLoading(false)
			}
		},
		[classData, schoolYearId, setError, username, password]
	)

	const selectSemester = useCallback(
		(forSemester: Semester) => {
			setSemester(forSemester)
			void fetchPreview(forSemester)
		},
		[fetchPreview]
	)

	const submit = useCallback(async () => {
		if (!classData || !previewData || !semester) return
		try {
			setTransferLoading(true)
			setError(null)

			const notes = Object.entries(editedNotes).map(([studentId, note]) => ({
				studentId: parseInt(studentId),
				note: typeof note === 'number' ? note : null,
				nullNoteReason: note === 'Nicht beurteilt' || note === 'Gestundet' ? note : undefined
			}))

			const notesByMatrikelnummer = (previewData.nmStudentsWithoutGradeOrMatch ?? []).map((nm) => ({
				matrikelnummer: nm.Matrikelnummer,
				note: editedNotesNmOnly[nm.Matrikelnummer] ?? null
			}))

			const result = await nmRequest<TransferResultResponse>(
				'/api/notensammler/transfer',
				{
					classId: classData.id,
					semester,
					...(schoolYearId != null && { schoolYearId }),
					notes,
					notesByMatrikelnummer
				},
				{ username, password }
			)

			setTransferResult(result)
			setStep('result')

			// Refresh so the "Übertragen" badge and LF id appear without a reload.
			await refreshClassData()
		} catch (e) {
			captureFrontendError(e, { location: 'notensammler', type: 'notenmanagement-transfer' })
			setError(e instanceof Error ? e.message : 'Failed to transfer')
			setTransferResult(null)
			setStep('result')
		} finally {
			setTransferLoading(false)
		}
	}, [
		classData,
		editedNotes,
		editedNotesNmOnly,
		previewData,
		refreshClassData,
		schoolYearId,
		semester,
		setError,
		username,
		password
	])

	return {
		step,
		setStep,
		open,
		close,
		username,
		setUsername,
		password,
		setPassword,
		selectSemester,
		previewLoading,
		transferLoading,
		previewData,
		editedNotes,
		setEditedNotes,
		editedNotesNmOnly,
		setEditedNotesNmOnly,
		transferResult,
		submit
	}
}
