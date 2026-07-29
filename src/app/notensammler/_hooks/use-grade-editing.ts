import { useCallback, useState } from 'react'
import { captureFrontendError } from '@/lib/frontend-error'
import {
	CONDUCT_NOTE_WISH_NONE,
	GESTUNDEN,
	NICHT_BEURTEILT,
	computeAverage,
	parseFinalGradeInput,
	parseGradeInput,
	type GradesData,
	type Semester
} from '@/lib/grades'
import type { ClassData, FinalGradesData, Period } from '../_lib/types'
import { useKeyedDebounce } from './use-keyed-debounce'

const SAVE_DEBOUNCE_MS = 500

type Params = {
	classData: ClassData | null
	schoolYearId: number | undefined
	grades: GradesData
	setGrades: React.Dispatch<React.SetStateAction<GradesData>>
	finalGrades: FinalGradesData
	setFinalGrades: React.Dispatch<React.SetStateAction<FinalGradesData>>
	setError: (message: string | null) => void
	refreshTeacherClasses: () => Promise<void>
}

const emptyFinalGrade = () => ({
	first: null,
	second: null,
	conductWishFirst: null,
	conductWishSecond: null
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
	refreshTeacherClasses
}: Params) {
	const [saving, setSaving] = useState(false)
	const [savingAll, setSavingAll] = useState(false)
	const { schedule, cancelAll } = useKeyedDebounce(SAVE_DEBOUNCE_MS)

	const saveGrade = useCallback(
		async (
			studentId: number,
			teacherId: number,
			semester: Semester,
			grade: number | null,
			silent = false
		) => {
			if (!classData) return
			try {
				if (!silent) setSaving(true)

				const response = await fetch('/api/notensammler/grades', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						studentId,
						teacherId,
						classId: classData.id,
						semester,
						grade,
						...(schoolYearId != null && { schoolYearId })
					})
				})

				if (!response.ok) {
					const errorData = (await response.json()) as { error?: string }
					throw new Error(errorData.error ?? 'Failed to save grade')
				}
			} catch (e) {
				captureFrontendError(e, { location: 'notensammler', type: 'save-grade' })
				throw e
			} finally {
				if (!silent) setSaving(false)
			}
		},
		// schoolYearId belongs here: without it the callback kept sending the
		// school year that was selected when the class was first opened.
		[classData, schoolYearId]
	)

	const handleGradeChange = useCallback(
		(studentId: number, teacherId: number, semester: Semester, value: string) => {
			const gradeValue = parseGradeInput(value)
			const previousValue = grades[studentId]?.[teacherId]?.[semester] ?? null

			setGrades((prev) => {
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
					} catch {
						setGrades((prev) => {
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
		[grades, saveGrade, schedule, setError, setGrades]
	)

	const getGrade = useCallback(
		(studentId: number, teacherId: number, semester: Semester): number | null =>
			grades[studentId]?.[teacherId]?.[semester] ?? null,
		[grades]
	)

	const calculateAverage = useCallback(
		(studentId: number, semester: Semester, period?: Period) => {
			if (!classData) return null
			const teacherIds =
				period === 'AM'
					? new Set(classData.amTeachers.map((teacher) => teacher.id))
					: period === 'PM'
						? new Set(classData.pmTeachers.map((teacher) => teacher.id))
						: null
			return computeAverage(grades[studentId], semester, teacherIds)
		},
		[classData, grades]
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
		[finalGrades, calculateAverage]
	)

	const saveFinalGrade = useCallback(
		async (
			studentId: number,
			semester: Semester,
			grade: number | null,
			silent = false,
			conductNoteWish?: string | null
		) => {
			if (!classData) return
			try {
				if (!silent) setSaving(true)
				const body: Record<string, unknown> = {
					studentId,
					classId: classData.id,
					semester,
					grade
				}
				if (schoolYearId != null) body.schoolYearId = schoolYearId
				if (conductNoteWish !== undefined) {
					body.conductNoteWish = conductNoteWish === '' ? null : conductNoteWish
				}

				const response = await fetch('/api/notensammler/final-grades', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				})
				if (!response.ok) {
					const errorData = (await response.json()) as { error?: string }
					throw new Error(errorData.error ?? 'Failed to save final grade')
				}
			} catch (e) {
				captureFrontendError(e, { location: 'notensammler', type: 'save-final-grade' })
				throw e
			} finally {
				if (!silent) setSaving(false)
			}
		},
		[classData, schoolYearId]
	)

	const handleFinalGradeChange = useCallback(
		(studentId: number, semester: Semester, value: string) => {
			const gradeValue = parseFinalGradeInput(value)
			const previousValue = finalGrades[studentId]?.[semester] ?? null
			const conductWish =
				semester === 'first'
					? (finalGrades[studentId]?.conductWishFirst ?? null)
					: (finalGrades[studentId]?.conductWishSecond ?? null)

			setFinalGrades((prev) => {
				const next = { ...prev }
				next[studentId] ??= emptyFinalGrade()
				next[studentId]![semester] = gradeValue
				return next
			})

			if (gradeValue === null && value !== '') return

			schedule(`final:${studentId}:${semester}`, () => {
				void (async () => {
					try {
						await saveFinalGrade(studentId, semester, gradeValue, false, conductWish)
					} catch {
						setFinalGrades((prev) => {
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
		[finalGrades, saveFinalGrade, schedule, setError, setFinalGrades]
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

			setFinalGrades((prev) => {
				const next = { ...prev }
				next[studentId] ??= emptyFinalGrade()
				if (semester === 'first') next[studentId]!.conductWishFirst = stateValue
				else next[studentId]!.conductWishSecond = stateValue
				return next
			})

			schedule(`conduct:${studentId}:${semester}`, () => {
				void (async () => {
					try {
						await saveFinalGrade(studentId, semester, gradeToSend, false, conductValue)
					} catch {
						setFinalGrades((prev) => {
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
		[finalGrades, getFinalGradeDisplay, saveFinalGrade, schedule, setError, setFinalGrades]
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
						{ studentId, teacherId, semester: 'second', grade: teacherGrades.second ?? null }
					)
				}
			}

			const finalGradesPayload: Array<{
				studentId: number
				semester: Semester
				grade: number | null
				conductNoteWish: string | null
			}> = []
			for (const studentKey of Object.keys(grades)) {
				const studentId = parseInt(studentKey)
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
							conductNoteWish: forApi(conduct)
						})
					}
				}
			}

			const batchBody = {
				classId: classData.id,
				...(schoolYearId != null && { schoolYearId })
			}
			const ok = new Response(JSON.stringify({ success: true, count: 0 }), { status: 200 })
			const [gradesRes, finalGradesRes] = await Promise.all([
				gradesPayload.length > 0
					? fetch('/api/notensammler/grades/batch', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ ...batchBody, grades: gradesPayload })
						})
					: Promise.resolve(ok),
				finalGradesPayload.length > 0
					? fetch('/api/notensammler/final-grades/batch', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ ...batchBody, finalGrades: finalGradesPayload })
						})
					: Promise.resolve(ok.clone())
			])

			if (!gradesRes.ok) {
				const err = (await gradesRes.json()) as { error?: string }
				throw new Error(err.error ?? 'Failed to save grades')
			}
			if (!finalGradesRes.ok) {
				const err = (await finalGradesRes.json()) as { error?: string }
				throw new Error(err.error ?? 'Failed to save final grades')
			}

			// Refresh so the per-class tab ticks reflect the new completion state.
			await refreshTeacherClasses()
		} catch (e) {
			captureFrontendError(e, { location: 'notensammler', type: 'save-all-grades' })
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
		schoolYearId,
		setError
	])

	return {
		saving,
		savingAll,
		handleGradeChange,
		getGrade,
		calculateAverage,
		getFinalGradeDisplay,
		handleFinalGradeChange,
		handleConductWishChange,
		saveAllGrades
	}
}
