'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useTranslation } from 'react-i18next'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { captureFrontendError } from '@/lib/frontend-error'
import { CheckCircle2, X } from 'lucide-react'
import { getStoredToken, storeToken, clearToken } from '@/lib/notenmanagement-token'

interface Student {
	id: number
	firstName: string
	lastName: string
	groupId: number | null
}

interface Teacher {
	id: number
	firstName: string
	lastName: string
}

interface Class {
	id: number
	name: string
	description: string | null
	subjectName?: string
	students: Student[]
	amTeachers: Teacher[]
	pmTeachers: Teacher[]
	transferStatus?: {
		first: { transferred: boolean; lfId: string | null }
		second: { transferred: boolean; lfId: string | null }
	}
}

type GradesData = Record<number, Record<number, {
	first: number | null
	second: number | null
}>>

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

type Semester = 'first' | 'second'

type PreviewStudent = {
	studentId: number
	firstName: string
	lastName: string
	avg: number
	note: 1 | 2 | 3 | 4 | 5
	matched: boolean
	matrikelnummer: number | null
}

type TransferPreviewResponse = {
	classId: number
	className: string
	subjectName: string
	subjectTruncated: string
	semester: Semester
	teacherCount: number
	students: PreviewStudent[]
	transferStatus?: {
		first: { transferred: boolean; lfId: string | null }
		second: { transferred: boolean; lfId: string | null }
	}
	counts: {
		totalStudents: number
		completeStudents: number
		matchedCompleteStudents: number
		unmatchedCompleteStudents: number
	}
	token?: string
	tokenExpiresIn?: number
}

type TransferResultResponse = {
	success: boolean
	lfId: string
	confirmation: unknown
	sentCount: number
	skipped: {
		completeStudents: number
		unmatchedOrMissingNote: number
	}
}

/**
 * Truncates subject name according to the pattern:
 * - "PBE4-Verbindungstechnik 1" → "PBE_4"
 * - "PBE4-Mech. Grundausbildung" → "PBE_4"
 * - "COPR-Elektrotechnik" → "COPR"
 * - "COPR-Elektronische Grundschaltungen" → "COPR"
 * - "ELWP-Elektrotechnik" → "ELWP_4"
 * - "NWWP-Naturwissenschaften" → "NWWP_4"
 */
function truncateSubject(subjectName: string): string {
	// Extract prefix before hyphen
	const parts = subjectName.split('-')
	const prefix = (parts[0] ?? subjectName).trim()
	
	// Check if prefix ends with digits
	const regex = /^(.+?)(\d+)$/
	const match = regex.exec(prefix)
	if (match?.[1] && match?.[2]) {
		// Add underscore before digits: "PBE4" → "PBE_4"
		return `${match[1]}_${match[2]}`
	}
	
	// Special case: ELWP and NWWP get "_4" appended
	if (prefix === 'ELWP' || prefix === 'NWWP') {
		return `${prefix}_4`
	}
	
	// No trailing digits, return as-is: "COPR" → "COPR"
	return prefix
}

/**
 * Notensammler page - Grade collection interface for teachers.
 * 
 * Allows selecting a class and entering grades for students across two semesters.
 * Grades are auto-saved with debounce, and averages are calculated automatically.
 */
export default function NotensammlerPage() {
	const { t } = useTranslation()
	const { data: session } = useSession()
	const searchParams = useSearchParams()
	const router = useRouter()
	const [classes, setClasses] = useState<Array<{ id: number; name: string }>>([])
	const [selectedClassId, setSelectedClassId] = useState<string>('')
	const [classData, setClassData] = useState<Class | null>(null)
	const [grades, setGrades] = useState<GradesData>({})
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [showFirstSemester, setShowFirstSemester] = useState(true)
	const [showSecondSemester, setShowSecondSemester] = useState(true)
	const [currentTeacherId, setCurrentTeacherId] = useState<number | null>(null)
	const [downloadingPdf, setDownloadingPdf] = useState(false)
	const [savingAll, setSavingAll] = useState(false)

	// Sorting state
	const [sortField, setSortField] = useState<'lastName' | 'groupId'>('lastName')
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

	// Notenmanagement transfer flow state
	const [showPasswordDialog, setShowPasswordDialog] = useState(false)
	const [showSemesterDialog, setShowSemesterDialog] = useState(false)
	const [showPreviewDialog, setShowPreviewDialog] = useState(false)
	const [showResultDialog, setShowResultDialog] = useState(false)
	const [transferUsername, setTransferUsername] = useState('')
	const [transferPassword, setTransferPassword] = useState('')
	const [transferSemester, setTransferSemester] = useState<Semester | null>(null)
	const [previewLoading, setPreviewLoading] = useState(false)
	const [transferLoading, setTransferLoading] = useState(false)
	const [previewData, setPreviewData] = useState<TransferPreviewResponse | null>(null)
	const [editedNotes, setEditedNotes] = useState<Record<number, 1 | 2 | 3 | 4 | 5>>({})
	const [transferResult, setTransferResult] = useState<TransferResultResponse | null>(null)

	// LF view state
	const [showLfViewPasswordDialog, setShowLfViewPasswordDialog] = useState(false)
	const [showLfViewDialog, setShowLfViewDialog] = useState(false)
	const [lfViewUsername, setLfViewUsername] = useState('')
	const [lfViewPassword, setLfViewPassword] = useState('')
	const [lfViewLoading, setLfViewLoading] = useState(false)
	const [lfViewData, setLfViewData] = useState<Array<{
		Matrikelnummer: number
		Nachname: string
		Vorname: string
		Note: number
		Punkte: number
		Kommentar: string
	}> | null>(null)
	const [selectedLfId, setSelectedLfId] = useState<string | null>(null)

	// Delete teacher grades state
	const [showDeleteDialog, setShowDeleteDialog] = useState(false)
	const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null)
	const [deleting, setDeleting] = useState(false)

	// Debounce timer for auto-save
	const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

	// Fetch all classes on mount
	useEffect(() => {
		const fetchClasses = async () => {
			try {
				const response = await fetch('/api/classes')
				if (!response.ok) throw new Error('Failed to fetch classes')
				const data = await response.json() as Array<{ id: number; name: string }>
				setClasses(data)
			} catch (e) {
				captureFrontendError(e, {
					location: 'notensammler',
					type: 'fetch-classes'
				})
				setError(e instanceof Error ? e.message : 'Failed to load classes')
			}
		}
		void fetchClasses()
	}, [])

	// Preselect class from query parameter when classes are loaded
	useEffect(() => {
		const classNameParam = searchParams.get('class')
		if (classNameParam && classes.length > 0 && !selectedClassId) {
			// Find class by name (case-insensitive match)
			const matchingClass = classes.find(
				cls => cls.name.toLowerCase() === classNameParam.toLowerCase()
			)
			if (matchingClass) {
				setSelectedClassId(matchingClass.id.toString())
			} else {
				// Class not found - show error message
				setError(t('notensammler.classNotFound', `Klasse "${classNameParam}" nicht gefunden.`))
			}
		}
	}, [classes, searchParams, selectedClassId, t])

	// Handle class selection and sync URL
	const handleClassChange = useCallback((classId: string) => {
		setSelectedClassId(classId)
		// Update URL query parameter
		const params = new URLSearchParams(searchParams.toString())
		if (classId) {
			const selectedClass = classes.find(cls => cls.id.toString() === classId)
			if (selectedClass) {
				params.set('class', selectedClass.name)
			}
		} else {
			params.delete('class')
		}
		router.replace(`/notensammler?${params.toString()}`, { scroll: false })
	}, [classes, router, searchParams])

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current)
			}
		}
	}, [])

	// Fetch current teacher ID
	useEffect(() => {
		const fetchCurrentTeacher = async () => {
			if (!session?.user?.name) {
				setCurrentTeacherId(null)
				return
			}

			try {
				const teacherResponse = await fetch(`/api/teachers/by-username?username=${session.user.name}`)
				if (teacherResponse.ok) {
				const teacher = await teacherResponse.json() as { id: number } | null
				setCurrentTeacherId(teacher?.id ?? null)
				} else {
					setCurrentTeacherId(null)
				}
			} catch (e) {
				console.error('Failed to fetch current teacher:', e)
				setCurrentTeacherId(null)
			}
		}

		void fetchCurrentTeacher()
	}, [session?.user?.name])

	// Fetch class data and grades when class is selected
	useEffect(() => {
		if (!selectedClassId) {
			setClassData(null)
			setGrades({})
			return
		}

		const fetchClassData = async () => {
			try {
				setLoading(true)
				setError(null)

				const [classResponse, gradesResponse] = await Promise.all([
					fetch(`/api/notensammler/class/${selectedClassId}`),
					fetch(`/api/notensammler/grades?classId=${selectedClassId}`)
				])

				if (!classResponse.ok) throw new Error('Failed to fetch class data')
				if (!gradesResponse.ok) throw new Error('Failed to fetch grades')

				const classDataResult = await classResponse.json() as Class
				const gradesResult = await gradesResponse.json() as GradesData

				setClassData(classDataResult)
				setGrades(gradesResult)
			} catch (e) {
				captureFrontendError(e, {
					location: 'notensammler',
					type: 'fetch-class-data'
				})
				setError(e instanceof Error ? e.message : 'Failed to load class data')
			} finally {
				setLoading(false)
			}
		}

		void fetchClassData()
	}, [selectedClassId])

	// Save grade function
	const saveGrade = useCallback(async (
		studentId: number,
		teacherId: number,
		semester: 'first' | 'second',
		grade: number | null,
		silent = false // If true, don't update saving state (for bulk saves)
	) => {
		if (!classData) return

		try {
			if (!silent) {
				setSaving(true)
			}

			const response = await fetch('/api/notensammler/grades', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					studentId,
					teacherId,
					classId: classData.id,
					semester,
					grade
				})
			})

			if (!response.ok) {
				const errorData = await response.json() as { error?: string }
				throw new Error(errorData.error ?? 'Failed to save grade')
			}

			// Update local state only if not in bulk save mode
			if (!silent) {
				setGrades(prev => {
					const newGrades = { ...prev }
					newGrades[studentId] ??= {}
					newGrades[studentId][teacherId] ??= { first: null, second: null }
					newGrades[studentId][teacherId][semester] = grade
					return newGrades
				})
			}
		} catch (e) {
			captureFrontendError(e, {
				location: 'notensammler',
				type: 'save-grade'
			})
			console.error('Failed to save grade:', e)
			throw e // Re-throw for bulk save error handling
		} finally {
			if (!silent) {
				setSaving(false)
			}
		}
	}, [classData])


	// Handle grade input change
	const handleGradeChange = useCallback((
		studentId: number,
		teacherId: number,
		semester: 'first' | 'second',
		value: string
	) => {
		// Update local state immediately for responsive UI
		setGrades(prev => {
			const newGrades = { ...prev }
			newGrades[studentId] ??= {}
			newGrades[studentId][teacherId] ??= { first: null, second: null }

			// Parse and validate grade
			if (value === '' || value === null || value === undefined) {
				newGrades[studentId][teacherId][semester] = null
			} else {
				const gradeNum = parseFloat(value)
				if (!isNaN(gradeNum) && ALLOWED_GRADES.includes(gradeNum)) {
					newGrades[studentId][teacherId][semester] = gradeNum
				} else {
					// Invalid grade, don't update
					return prev
				}
			}

			return newGrades
		})

		// Debounce save
		const gradeValue = value === '' ? null : parseFloat(value)
		if (gradeValue === null || (!isNaN(gradeValue) && ALLOWED_GRADES.includes(gradeValue))) {
			// Clear existing timer
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current)
			}

			// Set new timer
			saveTimerRef.current = setTimeout(() => {
				void saveGrade(studentId, teacherId, semester, gradeValue)
				saveTimerRef.current = null
			}, 500)
		}
	}, [saveGrade, saveTimerRef])

	// Calculate average for a student in a semester
	const calculateAverage = useCallback((studentId: number, semester: 'first' | 'second'): number | null => {
		if (!classData) return null

		const studentGrades = grades[studentId]
		if (!studentGrades) return null

		const gradeValues: number[] = []
		for (const teacherId in studentGrades) {
			const teacherGrades = studentGrades[parseInt(teacherId)]
			if (teacherGrades) {
				const grade = teacherGrades[semester]
				if (grade !== null && grade !== undefined) {
					gradeValues.push(grade)
				}
			}
		}

		if (gradeValues.length === 0) return null

		const sum = gradeValues.reduce((acc, val) => acc + val, 0)
		return Math.round((sum / gradeValues.length) * 10) / 10 // Round to 1 decimal place
	}, [grades, classData])

	// Get grade value
	const getGrade = useCallback((studentId: number, teacherId: number, semester: 'first' | 'second'): number | null => {
		return grades[studentId]?.[teacherId]?.[semester] ?? null
	}, [grades])

	// Sorted students with sequential IDs (only those assigned to a group)
	const sortedStudents = useMemo(() => {
		if (!classData) return []
		const students = [...classData.students]
			.filter(student => student.groupId !== null && student.groupId !== undefined)
			.sort((a, b) => {
				let primaryCompare = 0
				
				if (sortField === 'lastName') {
					// Sort by last name
					primaryCompare = a.lastName.localeCompare(b.lastName)
					if (primaryCompare !== 0) {
						return sortDirection === 'asc' ? primaryCompare : -primaryCompare
					}
					// Secondary sort by first name
					const firstNameCompare = a.firstName.localeCompare(b.firstName)
					return sortDirection === 'asc' ? firstNameCompare : -firstNameCompare
				} else {
					// Sort by group ID
					// Handle null values - put them at the end
					if (a.groupId === null && b.groupId === null) {
						primaryCompare = 0
					} else if (a.groupId === null) {
						primaryCompare = 1 // a goes after b
					} else if (b.groupId === null) {
						primaryCompare = -1 // a goes before b
					} else {
						primaryCompare = a.groupId - b.groupId
					}
					
					if (primaryCompare !== 0) {
						return sortDirection === 'asc' ? primaryCompare : -primaryCompare
					}
					// Secondary sort by last name
					const lastNameCompare = a.lastName.localeCompare(b.lastName)
					if (lastNameCompare !== 0) {
						return sortDirection === 'asc' ? lastNameCompare : -lastNameCompare
					}
					// Tertiary sort by first name
					const firstNameCompare = a.firstName.localeCompare(b.firstName)
					return sortDirection === 'asc' ? firstNameCompare : -firstNameCompare
				}
			})
		return students
	}, [classData, sortField, sortDirection])

	// Save all grades function
	const saveAllGrades = useCallback(async () => {
		if (!classData || !selectedClassId) return

		try {
			setSavingAll(true)
			setError(null)

			// Clear any pending debounce timers
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current)
				saveTimerRef.current = null
			}

			// Collect all grades to save
			const savePromises: Promise<void>[] = []

			for (const studentId in grades) {
				const studentGrades = grades[parseInt(studentId)]
				if (!studentGrades) continue

				for (const teacherId in studentGrades) {
					const teacherGrades = studentGrades[parseInt(teacherId)]
					if (!teacherGrades) continue

					// Save first semester grade (silent mode to avoid state conflicts)
					savePromises.push(
						saveGrade(parseInt(studentId), parseInt(teacherId), 'first', teacherGrades.first ?? null, true)
							.catch((e) => {
								console.error(`Failed to save grade for student ${studentId}, teacher ${teacherId}, first semester:`, e)
								throw e
							})
					)

					// Save second semester grade (silent mode to avoid state conflicts)
					savePromises.push(
						saveGrade(parseInt(studentId), parseInt(teacherId), 'second', teacherGrades.second ?? null, true)
							.catch((e) => {
								console.error(`Failed to save grade for student ${studentId}, teacher ${teacherId}, second semester:`, e)
								throw e
							})
					)
				}
			}

			// Save all grades in parallel (but limit concurrency to avoid overwhelming the server)
			const BATCH_SIZE = 10
			for (let i = 0; i < savePromises.length; i += BATCH_SIZE) {
				const batch = savePromises.slice(i, i + BATCH_SIZE)
				await Promise.all(batch)
			}
		} catch (e) {
			captureFrontendError(e, {
				location: 'notensammler',
				type: 'save-all-grades'
			})
			setError(e instanceof Error ? e.message : 'Failed to save all grades')
		} finally {
			setSavingAll(false)
		}
	}, [classData, selectedClassId, grades, saveGrade])

	// Handle PDF download
	const handleDownloadPDF = useCallback(async () => {
		if (!selectedClassId || !classData) return

		try {
			setDownloadingPdf(true)
			const response = await fetch(`/api/notensammler/pdf?classId=${selectedClassId}`)
			
			if (!response.ok) {
				throw new Error('Failed to generate PDF')
			}

			const blob = await response.blob()
			const url = window.URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			const today = new Date().toLocaleDateString('de-DE')
			a.download = `notensammler-${classData.name}-${today}.pdf`
			document.body.appendChild(a)
			a.click()
			window.URL.revokeObjectURL(url)
			document.body.removeChild(a)
		} catch (e) {
			captureFrontendError(e, {
				location: 'notensammler',
				type: 'download-pdf'
			})
			setError(e instanceof Error ? e.message : 'Failed to download PDF')
		} finally {
			setDownloadingPdf(false)
		}
	}, [selectedClassId, classData])

	// Delete all grades for a teacher
	const deleteTeacherGrades = useCallback(async () => {
		if (!teacherToDelete || !classData || !selectedClassId) return

		try {
			setDeleting(true)
			setError(null)

			const response = await fetch(
				`/api/notensammler/grades?teacherId=${teacherToDelete.id}&classId=${classData.id}`,
				{
					method: 'DELETE'
				}
			)

			if (!response.ok) {
				const errorData = await response.json() as { error?: string }
				throw new Error(errorData.error ?? 'Failed to delete grades')
			}

			// Update local state to remove deleted teacher's grades
			setGrades(prev => {
				const newGrades = { ...prev }
				for (const studentId in newGrades) {
					const studentGrades = newGrades[parseInt(studentId)]
					if (studentGrades?.[teacherToDelete.id]) {
						delete studentGrades[teacherToDelete.id]
						// Remove student entry if no teachers left
						if (Object.keys(studentGrades).length === 0) {
							delete newGrades[parseInt(studentId)]
						}
					}
				}
				return newGrades
			})

			// Close dialog and reset state
			setShowDeleteDialog(false)
			setTeacherToDelete(null)
		} catch (e) {
			captureFrontendError(e, {
				location: 'notensammler',
				type: 'delete-teacher-grades'
			})
			setError(e instanceof Error ? e.message : 'Failed to delete grades')
		} finally {
			setDeleting(false)
		}
	}, [teacherToDelete, classData, selectedClassId])

	const openTransferFlow = useCallback(() => {
		if (!classData || !selectedClassId) return
		setTransferResult(null)
		setPreviewData(null)
		setEditedNotes({})
		setTransferSemester(null)
		setTransferUsername(session?.user?.name ?? '')
		setTransferPassword('')
		setShowPasswordDialog(true)
	}, [classData, selectedClassId, session?.user?.name])

	const fetchTransferPreview = useCallback(async (semester: Semester) => {
		if (!classData) return

		try {
			setPreviewLoading(true)
			setError(null)

			// Check for stored token first
			const storedToken = getStoredToken()
			const useStoredToken = storedToken && storedToken.username === transferUsername

			const res = await fetch('/api/notensammler/transfer/preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					classId: classData.id,
					semester,
					username: transferUsername,
					...(useStoredToken ? { token: storedToken.token } : { password: transferPassword })
				})
			})

			const data = await res.json() as { error?: string; token?: string; tokenExpiresIn?: number } | TransferPreviewResponse
			if (!res.ok) {
				// If token was invalid, clear it and retry with password
				if (useStoredToken) {
					clearToken()
					// Retry with password if available
					if (transferPassword) {
						const retryRes = await fetch('/api/notensammler/transfer/preview', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								classId: classData.id,
								semester,
								username: transferUsername,
								password: transferPassword
							})
						})
						const retryData = await retryRes.json() as { error?: string; token?: string; tokenExpiresIn?: number } | TransferPreviewResponse
						if (!retryRes.ok) {
							throw new Error((retryData as { error?: string }).error ?? 'Failed to build preview')
						}
						// Store new token if provided
						if ('token' in retryData && retryData.token && 'tokenExpiresIn' in retryData && retryData.tokenExpiresIn) {
							storeToken(retryData.token, retryData.tokenExpiresIn, transferUsername)
						}
						const preview = retryData as TransferPreviewResponse
						setPreviewData(preview)
						setEditedNotes(
							Object.fromEntries(preview.students.map(s => [s.studentId, s.note]))
						)
						setShowPreviewDialog(true)
						return
					}
				}
				throw new Error((data as { error?: string }).error ?? 'Failed to build preview')
			}

			// Store new token if provided
			if ('token' in data && data.token && 'tokenExpiresIn' in data && data.tokenExpiresIn) {
				storeToken(data.token, data.tokenExpiresIn, transferUsername)
			}

			const preview = data as TransferPreviewResponse
			setPreviewData(preview)
			setEditedNotes(
				Object.fromEntries(preview.students.map(s => [s.studentId, s.note]))
			)
			setShowPreviewDialog(true)
		} catch (e) {
			captureFrontendError(e, { location: 'notensammler', type: 'notenmanagement-preview' })
			setError(e instanceof Error ? e.message : 'Failed to build transfer preview')
		} finally {
			setPreviewLoading(false)
		}
	}, [classData, transferPassword])

	const submitTransfer = useCallback(async () => {
		if (!classData || !previewData || !transferSemester) return
		try {
			setTransferLoading(true)
			setError(null)

			const notesPayload = Object.entries(editedNotes).map(([studentId, note]) => ({
				studentId: parseInt(studentId),
				note
			}))

			// Check for stored token first
			const storedToken = getStoredToken()
			const useStoredToken = storedToken && storedToken.username === transferUsername

			const res = await fetch('/api/notensammler/transfer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					classId: classData.id,
					semester: transferSemester,
					username: transferUsername,
					...(useStoredToken ? { token: storedToken.token } : { password: transferPassword }),
					notes: notesPayload
				})
			})

			const data = await res.json() as { error?: string; details?: unknown; token?: string; tokenExpiresIn?: number } | TransferResultResponse
			if (!res.ok) {
				// If token was invalid, clear it and retry with password
				if (useStoredToken && transferPassword) {
					clearToken()
					const retryRes = await fetch('/api/notensammler/transfer', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							classId: classData.id,
							semester: transferSemester,
							username: transferUsername,
							password: transferPassword,
							notes: notesPayload
						})
					})
					const retryData = await retryRes.json() as { error?: string; details?: unknown; token?: string; tokenExpiresIn?: number } | TransferResultResponse
					if (!retryRes.ok) {
						const details = (retryData as { details?: unknown }).details
						const msg = (retryData as { error?: string }).error ?? 'Transfer failed'
						throw new Error(details ? `${msg}\n${JSON.stringify(details, null, 2)}` : msg)
					}
					// Store new token if provided
					if ('token' in retryData && retryData.token && 'tokenExpiresIn' in retryData && retryData.tokenExpiresIn) {
						storeToken(retryData.token, retryData.tokenExpiresIn, transferUsername)
					}
					setTransferResult(retryData as TransferResultResponse)
					setShowPreviewDialog(false)
					setShowResultDialog(true)
					return
				}
				const details = (data as { details?: unknown }).details
				const msg = (data as { error?: string }).error ?? 'Transfer failed'
				throw new Error(details ? `${msg}\n${JSON.stringify(details, null, 2)}` : msg)
			}

			// Store new token if provided
			if ('token' in data && data.token && 'tokenExpiresIn' in data && data.tokenExpiresIn) {
				storeToken(data.token, data.tokenExpiresIn, transferUsername)
			}

			setTransferResult(data as TransferResultResponse)
			setShowPreviewDialog(false)
			setShowResultDialog(true)
			
			// Refetch class data to update transfer status
			if (selectedClassId) {
				try {
					const classRes = await fetch(`/api/notensammler/class/${selectedClassId}`)
					if (classRes.ok) {
						const updatedClassData = await classRes.json() as Class
						setClassData(updatedClassData)
					}
				} catch (e) {
					console.error('Failed to refresh class data:', e)
				}
			}
		} catch (e) {
			captureFrontendError(e, { location: 'notensammler', type: 'notenmanagement-transfer' })
			setError(e instanceof Error ? e.message : 'Failed to transfer')
			setTransferResult(null)
			setShowResultDialog(true)
		} finally {
			setTransferLoading(false)
		}
	}, [classData, editedNotes, previewData, transferPassword, transferSemester])

	// Helper to fetch LF data with token
	const fetchLfDataWithToken = useCallback(async (token: string, username: string, lfId: string) => {
		try {
			setLfViewLoading(true)
			setError(null)

			const res = await fetch('/api/notensammler/transfer/view', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lfId,
					username,
					token
				})
			})

			const data = await res.json() as { error?: string; details?: unknown; success?: boolean; notes?: unknown; token?: string; tokenExpiresIn?: number }
			if (!res.ok) {
				// If token was invalid, clear it and show password dialog
				clearToken()
				setShowLfViewPasswordDialog(true)
				return
			}

			// Store new token if provided
			if (data.token && data.tokenExpiresIn) {
				storeToken(data.token, data.tokenExpiresIn, username)
			}

			if (data.success && Array.isArray(data.notes)) {
				setLfViewData(data.notes as Array<{
					Matrikelnummer: number
					Nachname: string
					Vorname: string
					Note: number
					Punkte: number
					Kommentar: string
				}>)
				setShowLfViewDialog(true)
			} else {
				throw new Error('Invalid response format')
			}
		} catch (e) {
			captureFrontendError(e, {
				location: 'notensammler',
				type: 'fetch-lf-data'
			})
			setError(e instanceof Error ? e.message : 'Failed to fetch LF data')
		} finally {
			setLfViewLoading(false)
		}
	}, [])

	// Open LF view flow
	const openLfView = useCallback((lfId: string) => {
		setSelectedLfId(lfId)
		const defaultUsername = session?.user?.name ?? ''
		setLfViewUsername(defaultUsername)
		setLfViewPassword('')
		setLfViewData(null)
		
		// Check if we have a valid token for the default username
		const storedToken = getStoredToken()
		if (storedToken && storedToken.username === defaultUsername) {
			// Use stored token directly
			void fetchLfDataWithToken(storedToken.token, defaultUsername, lfId)
		} else {
			// Show password dialog
			setShowLfViewPasswordDialog(true)
		}
	}, [session?.user?.name, fetchLfDataWithToken])

	// Fetch LF data from Notenmanagement
	const fetchLfData = useCallback(async () => {
		if (!selectedLfId || !lfViewPassword) return

		try {
			setLfViewLoading(true)
			setError(null)

			const res = await fetch('/api/notensammler/transfer/view', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lfId: selectedLfId,
					username: lfViewUsername,
					password: lfViewPassword
				})
			})

			const data = await res.json() as { error?: string; details?: unknown; success?: boolean; notes?: unknown; token?: string; tokenExpiresIn?: number }
			if (!res.ok) {
				const details = (data as { details?: unknown }).details
				const msg = (data as { error?: string }).error ?? 'Failed to fetch LF data'
				throw new Error(details ? `${msg}\n${JSON.stringify(details, null, 2)}` : msg)
			}

			// Store new token if provided
			if (data.token && data.tokenExpiresIn) {
				storeToken(data.token, data.tokenExpiresIn, lfViewUsername)
			}

			if (data.success && Array.isArray(data.notes)) {
				setLfViewData(data.notes as Array<{
					Matrikelnummer: number
					Nachname: string
					Vorname: string
					Note: number
					Punkte: number
					Kommentar: string
				}>)
				setShowLfViewPasswordDialog(false)
				setShowLfViewDialog(true)
			} else {
				throw new Error('Invalid response format')
			}
		} catch (e) {
			captureFrontendError(e, {
				location: 'notensammler',
				type: 'fetch-lf-data'
			})
			setError(e instanceof Error ? e.message : 'Failed to fetch LF data')
		} finally {
			setLfViewLoading(false)
		}
	}, [selectedLfId, lfViewPassword, lfViewUsername])

	return (
		<div className="container mx-auto p-4">
			<div className="mb-8">
				<h1 className="text-3xl font-bold mb-4">{t('notensammler.title', 'Notensammler')}</h1>
				{error && (
					<div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive flex items-start justify-between gap-4">
						<div className="whitespace-pre-line">{error}</div>
						<Button variant="outline" onClick={() => setError(null)}>
							{t('common.close', 'Schließen')}
						</Button>
					</div>
				)}
				<div className="mb-4">
					<label className="block text-sm font-medium mb-2">
						{t('notensammler.selectClass', 'Klasse auswählen')}
					</label>
					<Select value={selectedClassId} onValueChange={handleClassChange}>
						<SelectTrigger className="w-[300px]">
							<SelectValue placeholder={t('notensammler.selectClassPlaceholder', 'Bitte Klasse auswählen...')} />
						</SelectTrigger>
						<SelectContent>
							{classes.map((cls) => (
								<SelectItem key={cls.id} value={cls.id.toString()}>
									{cls.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{classData && (
					<div className="flex items-center gap-6 mb-4">
						<div className="flex items-center space-x-2">
							<Checkbox
								id="show-first-semester"
								checked={showFirstSemester}
								onCheckedChange={(checked) => setShowFirstSemester(checked === true)}
							/>
							<Label htmlFor="show-first-semester" className="cursor-pointer flex items-center gap-2">
								{t('notensammler.showFirstSemester', '1. Semester anzeigen')}
								{classData.transferStatus?.first.transferred && (
									<Badge 
										variant="outline" 
										className="text-xs cursor-pointer hover:bg-accent"
										onClick={(e) => {
											e.stopPropagation()
											if (classData.transferStatus?.first.lfId) {
												openLfView(classData.transferStatus.first.lfId)
											}
										}}
									>
										<CheckCircle2 className="h-3 w-3 mr-1" />
										{t('notensammler.transferred', 'Übertragen')}
										{classData.transferStatus.first.lfId && (
											<span className="ml-1 text-muted-foreground">
												(LF: {classData.transferStatus.first.lfId})
											</span>
										)}
									</Badge>
								)}
							</Label>
						</div>
						<div className="flex items-center space-x-2">
							<Checkbox
								id="show-second-semester"
								checked={showSecondSemester}
								onCheckedChange={(checked) => setShowSecondSemester(checked === true)}
							/>
							<Label htmlFor="show-second-semester" className="cursor-pointer flex items-center gap-2">
								{t('notensammler.showSecondSemester', '2. Semester anzeigen')}
								{classData.transferStatus?.second.transferred && (
									<Badge 
										variant="outline" 
										className="text-xs cursor-pointer hover:bg-accent"
										onClick={(e) => {
											e.stopPropagation()
											if (classData.transferStatus?.second.lfId) {
												openLfView(classData.transferStatus.second.lfId)
											}
										}}
									>
										<CheckCircle2 className="h-3 w-3 mr-1" />
										{t('notensammler.transferred', 'Übertragen')}
										{classData.transferStatus.second.lfId && (
											<span className="ml-1 text-muted-foreground">
												(LF: {classData.transferStatus.second.lfId})
											</span>
										)}
									</Badge>
								)}
							</Label>
						</div>
						<Button
							onClick={saveAllGrades}
							disabled={savingAll || !selectedClassId}
						>
							{savingAll ? (
								<>
									<Spinner size="sm" className="mr-2" />
									{t('notensammler.savingAll', 'Speichere...')}
								</>
							) : (
								t('notensammler.saveAll', 'Alle speichern')
							)}
						</Button>
						<Button
							onClick={handleDownloadPDF}
							disabled={downloadingPdf || !selectedClassId}
						>
							{downloadingPdf ? (
								<>
									<Spinner size="sm" className="mr-2" />
									{t('notensammler.downloadingPdf', 'PDF wird erstellt...')}
								</>
							) : (
								t('notensammler.downloadPdf', 'PDF herunterladen')
							)}
						</Button>
						<Button
							variant="secondary"
							onClick={openTransferFlow}
							disabled={!selectedClassId}
						>
							{t('notensammler.transferToNotenmanagement', 'An Notenmanagement übertragen')}
						</Button>
					</div>
				)}
			</div>

			{loading && (
				<div className="flex items-center justify-center min-h-[200px]">
					<Spinner size="lg" />
				</div>
			)}

			{classData && !loading && (
				<Card>
					<CardHeader>
						<CardTitle>
							{classData.subjectName 
								? `${classData.name} - ${truncateSubject(classData.subjectName)}`
								: classData.name}
						</CardTitle>
						<div className="flex items-center gap-2 mt-2">
							<label className="text-sm font-medium">
								{t('notensammler.sortBy', 'Sortieren nach')}:
							</label>
							<Select value={sortField} onValueChange={(value) => setSortField(value as 'lastName' | 'groupId')}>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="lastName">
										{t('notensammler.sortByLastName', 'Nachname')}
									</SelectItem>
									<SelectItem value="groupId">
										{t('notensammler.sortByGroup', 'Gruppennummer')}
									</SelectItem>
								</SelectContent>
							</Select>
							<Select value={sortDirection} onValueChange={(value) => setSortDirection(value as 'asc' | 'desc')}>
								<SelectTrigger className="w-[150px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="asc">
										{t('notensammler.sortAscending', 'Aufsteigend')}
									</SelectItem>
									<SelectItem value="desc">
										{t('notensammler.sortDescending', 'Absteigend')}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</CardHeader>
					<CardContent>
						<div className="overflow-x-auto">
							<Table className="border-collapse">
								<TableHeader>
									{/* Period labels row */}
									<TableRow>
										<TableHead rowSpan={2} className="sticky left-0 bg-background z-10 w-16">{t('notensammler.id', 'ID')}</TableHead>
										<TableHead rowSpan={2} className="sticky left-16 bg-background z-10 w-20">{t('notensammler.group', 'Gruppe')}</TableHead>
										<TableHead rowSpan={2} className="sticky left-36 bg-background z-10 min-w-[200px]">{t('notensammler.student', 'Schüler')}</TableHead>
										{/* First Semester - Period labels */}
										{showFirstSemester && classData.amTeachers.length > 0 && (
											<TableHead colSpan={classData.amTeachers.length} className="text-center border-b">
												{t('notensammler.vormittag', 'Vormittag')}
											</TableHead>
										)}
										{/* Separator between AM and PM */}
										{showFirstSemester && classData.amTeachers.length > 0 && classData.pmTeachers.length > 0 && (
											<TableHead rowSpan={2} className="border-l-2 border-muted-foreground/30 w-1 p-0"></TableHead>
										)}
										{showFirstSemester && classData.pmTeachers.length > 0 && (
											<TableHead colSpan={classData.pmTeachers.length} className="text-center border-b">
												{t('notensammler.nachmittag', 'Nachmittag')}
											</TableHead>
										)}
										<TableHead rowSpan={2} className="bg-muted">{t('notensammler.average', 'Durchschnitt')} ({t('notensammler.firstSemester', '1. Semester')})</TableHead>
										{/* Second Semester - Period labels */}
										{showSecondSemester && classData.amTeachers.length > 0 && (
											<TableHead colSpan={classData.amTeachers.length} className="text-center border-b">
												{t('notensammler.vormittag', 'Vormittag')}
											</TableHead>
										)}
										{/* Separator between AM and PM */}
										{showSecondSemester && classData.amTeachers.length > 0 && classData.pmTeachers.length > 0 && (
											<TableHead rowSpan={2} className="border-l-2 border-muted-foreground/30 w-1 p-0"></TableHead>
										)}
										{showSecondSemester && classData.pmTeachers.length > 0 && (
											<TableHead colSpan={classData.pmTeachers.length} className="text-center border-b">
												{t('notensammler.nachmittag', 'Nachmittag')}
											</TableHead>
										)}
										<TableHead rowSpan={2} className="bg-muted">{t('notensammler.average', 'Durchschnitt')} ({t('notensammler.secondSemester', '2. Semester')})</TableHead>
									</TableRow>
									{/* Teacher names row */}
									<TableRow>
										{/* First Semester - AM Teachers */}
										{showFirstSemester && classData.amTeachers.map((teacher) => (
											<TableHead 
												key={`first-am-${teacher.id}`}
												className={currentTeacherId === teacher.id ? 'bg-primary/20 font-semibold' : ''}
											>
												<div className="flex items-center justify-between gap-2">
													<span>{teacher.firstName} {teacher.lastName}</span>
													<Button
														variant="ghost"
														size="icon"
														className="h-5 w-5 opacity-60 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
														onClick={(e) => {
															e.stopPropagation()
															setTeacherToDelete(teacher)
															setShowDeleteDialog(true)
														}}
														title={t('notensammler.deleteTeacherGrades', 'Alle Noten für diesen Lehrer löschen')}
													>
														<X className="h-3 w-3" />
													</Button>
												</div>
											</TableHead>
										))}
										{/* First Semester - PM Teachers */}
										{showFirstSemester && classData.pmTeachers.map((teacher) => (
											<TableHead 
												key={`first-pm-${teacher.id}`}
												className={currentTeacherId === teacher.id ? 'bg-primary/20 font-semibold' : ''}
											>
												<div className="flex items-center justify-between gap-2">
													<span>{teacher.firstName} {teacher.lastName}</span>
													<Button
														variant="ghost"
														size="icon"
														className="h-5 w-5 opacity-60 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
														onClick={(e) => {
															e.stopPropagation()
															setTeacherToDelete(teacher)
															setShowDeleteDialog(true)
														}}
														title={t('notensammler.deleteTeacherGrades', 'Alle Noten für diesen Lehrer löschen')}
													>
														<X className="h-3 w-3" />
													</Button>
												</div>
											</TableHead>
										))}
										{/* Second Semester - AM Teachers */}
										{showSecondSemester && classData.amTeachers.map((teacher) => (
											<TableHead 
												key={`second-am-${teacher.id}`}
												className={currentTeacherId === teacher.id ? 'bg-primary/20 font-semibold' : ''}
											>
												<div className="flex items-center justify-between gap-2">
													<span>{teacher.firstName} {teacher.lastName}</span>
													<Button
														variant="ghost"
														size="icon"
														className="h-5 w-5 opacity-60 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
														onClick={(e) => {
															e.stopPropagation()
															setTeacherToDelete(teacher)
															setShowDeleteDialog(true)
														}}
														title={t('notensammler.deleteTeacherGrades', 'Alle Noten für diesen Lehrer löschen')}
													>
														<X className="h-3 w-3" />
													</Button>
												</div>
											</TableHead>
										))}
										{/* Second Semester - PM Teachers */}
										{showSecondSemester && classData.pmTeachers.map((teacher) => (
											<TableHead 
												key={`second-pm-${teacher.id}`}
												className={currentTeacherId === teacher.id ? 'bg-primary/20 font-semibold' : ''}
											>
												<div className="flex items-center justify-between gap-2">
													<span>{teacher.firstName} {teacher.lastName}</span>
													<Button
														variant="ghost"
														size="icon"
														className="h-5 w-5 opacity-60 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
														onClick={(e) => {
															e.stopPropagation()
															setTeacherToDelete(teacher)
															setShowDeleteDialog(true)
														}}
														title={t('notensammler.deleteTeacherGrades', 'Alle Noten für diesen Lehrer löschen')}
													>
														<X className="h-3 w-3" />
													</Button>
												</div>
											</TableHead>
										))}
									</TableRow>
								</TableHeader>
								<TableBody>
									{sortedStudents.map((student, index) => {
										const firstAvg = calculateAverage(student.id, 'first')
										const secondAvg = calculateAverage(student.id, 'second')
										return (
											<TableRow key={student.id}>
												<TableCell className="sticky left-0 bg-background z-10 font-medium w-16">
													{index + 1}
												</TableCell>
												<TableCell className="sticky left-16 bg-background z-10 w-20">
													{student.groupId ?? '-'}
												</TableCell>
												<TableCell className="sticky left-36 bg-background z-10 font-medium min-w-[200px]">
													{student.lastName}, {student.firstName}
												</TableCell>
												{/* First semester - AM teacher columns */}
												{showFirstSemester && classData.amTeachers.map((teacher) => {
													const grade = getGrade(student.id, teacher.id, 'first')
													const isCurrentTeacher = currentTeacherId === teacher.id
													return (
														<TableCell 
															key={`first-am-${student.id}-${teacher.id}`}
															className={isCurrentTeacher ? 'bg-primary/10' : ''}
														>
															<Input
																type="number"
																min="1"
																max="5"
																step="0.5"
																value={grade ?? ''}
																onChange={(e) => handleGradeChange(student.id, teacher.id, 'first', e.target.value)}
																className="w-20"
															/>
														</TableCell>
													)
												})}
												{/* Separator between AM and PM */}
												{showFirstSemester && classData.amTeachers.length > 0 && classData.pmTeachers.length > 0 && (
													<TableCell className="border-l-2 border-muted-foreground/30 p-0"></TableCell>
												)}
												{/* First semester - PM teacher columns */}
												{showFirstSemester && classData.pmTeachers.map((teacher) => {
													const grade = getGrade(student.id, teacher.id, 'first')
													const isCurrentTeacher = currentTeacherId === teacher.id
													return (
														<TableCell 
															key={`first-pm-${student.id}-${teacher.id}`}
															className={isCurrentTeacher ? 'bg-primary/10' : ''}
														>
															<Input
																type="number"
																min="1"
																max="5"
																step="0.5"
																value={grade ?? ''}
																onChange={(e) => handleGradeChange(student.id, teacher.id, 'first', e.target.value)}
																className="w-20"
															/>
														</TableCell>
													)
												})}
												{/* First semester average */}
												<TableCell className="bg-muted font-medium">
													{firstAvg !== null ? firstAvg.toFixed(1) : '-'}
												</TableCell>
												{/* Second semester - AM teacher columns */}
												{showSecondSemester && classData.amTeachers.map((teacher) => {
													const grade = getGrade(student.id, teacher.id, 'second')
													const isCurrentTeacher = currentTeacherId === teacher.id
													return (
														<TableCell 
															key={`second-am-${student.id}-${teacher.id}`}
															className={isCurrentTeacher ? 'bg-primary/10' : ''}
														>
															<Input
																type="number"
																min="1"
																max="5"
																step="0.5"
																value={grade ?? ''}
																onChange={(e) => handleGradeChange(student.id, teacher.id, 'second', e.target.value)}
																className="w-20"
															/>
														</TableCell>
													)
												})}
												{/* Separator between AM and PM */}
												{showSecondSemester && classData.amTeachers.length > 0 && classData.pmTeachers.length > 0 && (
													<TableCell className="border-l-2 border-muted-foreground/30 p-0"></TableCell>
												)}
												{/* Second semester - PM teacher columns */}
												{showSecondSemester && classData.pmTeachers.map((teacher) => {
													const grade = getGrade(student.id, teacher.id, 'second')
													const isCurrentTeacher = currentTeacherId === teacher.id
													return (
														<TableCell 
															key={`second-pm-${student.id}-${teacher.id}`}
															className={isCurrentTeacher ? 'bg-primary/10' : ''}
														>
															<Input
																type="number"
																min="1"
																max="5"
																step="0.5"
																value={grade ?? ''}
																onChange={(e) => handleGradeChange(student.id, teacher.id, 'second', e.target.value)}
																className="w-20"
															/>
														</TableCell>
													)
												})}
												{/* Second semester average */}
												<TableCell className="bg-muted font-medium">
													{secondAvg !== null ? secondAvg.toFixed(1) : '-'}
												</TableCell>
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</div>
						{saving && (
							<div className="mt-4 text-sm text-muted-foreground">
								{t('notensammler.saving', 'Speichere...')}
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{/* Password dialog */}
			<Dialog open={showPasswordDialog} onOpenChange={(open) => setShowPasswordDialog(open)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('notensammler.nmPasswordTitle', 'Notenmanagement Anmeldung')}</DialogTitle>
						<DialogDescription>
							{t('notensammler.nmPasswordDesc', 'Bitte gib deine Anmeldedaten für Notenmanagement ein.')}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<Input
							type="text"
							value={transferUsername}
							onChange={(e) => setTransferUsername(e.target.value)}
							placeholder={t('notensammler.username', 'Benutzername')}
							autoComplete="username"
						/>
						<Input
							type="password"
							value={transferPassword}
							onChange={(e) => setTransferPassword(e.target.value)}
							placeholder={t('notensammler.password', 'Passwort')}
							autoComplete="current-password"
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
							{t('common.cancel', 'Abbrechen')}
						</Button>
						<Button
							onClick={() => {
								setShowPasswordDialog(false)
								setShowSemesterDialog(true)
							}}
							disabled={!transferUsername || !transferPassword}
						>
							{t('common.continue', 'Weiter')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Semester dialog */}
			<Dialog open={showSemesterDialog} onOpenChange={(open) => setShowSemesterDialog(open)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('notensammler.nmSemesterTitle', 'Semester auswählen')}</DialogTitle>
						<DialogDescription>
							{t('notensammler.nmSemesterDesc', 'Welches Semester möchtest du übertragen?')}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowSemesterDialog(false)}>
							{t('common.cancel', 'Abbrechen')}
						</Button>
						<Button
							onClick={() => {
								setTransferSemester('first')
								setShowSemesterDialog(false)
								void fetchTransferPreview('first')
							}}
							disabled={previewLoading}
						>
							{previewLoading ? (
								<>
									<Spinner size="sm" className="mr-2" />
									{t('notensammler.loading', 'Lade...')}
								</>
							) : (
								t('notensammler.firstSemester', '1. Semester')
							)}
						</Button>
						<Button
							onClick={() => {
								setTransferSemester('second')
								setShowSemesterDialog(false)
								void fetchTransferPreview('second')
							}}
							disabled={previewLoading}
						>
							{previewLoading ? (
								<>
									<Spinner size="sm" className="mr-2" />
									{t('notensammler.loading', 'Lade...')}
								</>
							) : (
								t('notensammler.secondSemester', '2. Semester')
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Preview dialog */}
			<Dialog open={showPreviewDialog} onOpenChange={(open) => setShowPreviewDialog(open)}>
				<DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{t('notensammler.nmPreviewTitle', 'Vorschau: Übertragung an Notenmanagement')}
						</DialogTitle>
						{previewData && (
							<DialogDescription className="whitespace-pre-line">
								{t('notensammler.nmPreviewMeta', 'Klasse')}: {previewData.className} · {t('notensammler.subject', 'Fach')}: {previewData.subjectTruncated} · {t('notensammler.teachers', 'Lehrer')}: {previewData.teacherCount}
								{previewData.counts.unmatchedCompleteStudents > 0 ? `\n${t('notensammler.nmUnmatchedWarning', 'Unmatched Schüler werden nicht übertragen.')}` : ''}
							</DialogDescription>
						)}
					</DialogHeader>

					{previewLoading && (
						<div className="flex items-center justify-center py-8">
							<Spinner size="lg" />
						</div>
					)}

					{previewData && (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t('notensammler.student', 'Schüler')}</TableHead>
										<TableHead className="w-32">{t('notensammler.grade', 'Note')}</TableHead>
										<TableHead className="w-40">{t('notensammler.matrikelnummer', 'Matrikelnummer')}</TableHead>
										<TableHead className="w-28">{t('notensammler.match', 'Match')}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{previewData.students.map((s) => (
										<TableRow key={s.studentId}>
											<TableCell>
												{s.lastName}, {s.firstName}
											</TableCell>
											<TableCell>
												<Input
													type="number"
													min="1"
													max="5"
													step="1"
													value={editedNotes[s.studentId] ?? s.note}
													onChange={(e) => {
														const v = parseInt(e.target.value)
														if (![1, 2, 3, 4, 5].includes(v)) return
														setEditedNotes(prev => ({ ...prev, [s.studentId]: v as 1 | 2 | 3 | 4 | 5 }))
													}}
													className="w-24"
												/>
											</TableCell>
											<TableCell>
												{s.matrikelnummer ?? '-'}
											</TableCell>
											<TableCell>
												{s.matched ? (
													<span className="text-green-600 font-medium">✓</span>
												) : (
													<span className="text-red-600 font-medium">✗</span>
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}

					<DialogFooter>
						<Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
							{t('common.cancel', 'Abbrechen')}
						</Button>
						<Button onClick={() => void submitTransfer()} disabled={transferLoading || !previewData}>
							{transferLoading ? (
								<>
									<Spinner size="sm" className="mr-2" />
									{t('notensammler.transferring', 'Übertrage...')}
								</>
							) : (
								previewData?.transferStatus && 
								((previewData.semester === 'first' && previewData.transferStatus.first.transferred) ||
								 (previewData.semester === 'second' && previewData.transferStatus.second.transferred))
									? t('notensammler.updateTransfer', 'Aktualisieren')
									: t('notensammler.transferNow', 'Jetzt übertragen')
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Result dialog */}
			<Dialog
				open={showResultDialog}
				onOpenChange={(open) => {
					setShowResultDialog(open)
					if (!open) {
						setTransferPassword('')
						setTransferSemester(null)
						setPreviewData(null)
						setEditedNotes({})
					}
				}}
			>
				<DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{transferResult?.success
								? t('notensammler.nmSuccessTitle', 'Übertragung erfolgreich')
								: t('notensammler.nmErrorTitle', 'Übertragung fehlgeschlagen')}
						</DialogTitle>
						<DialogDescription className="whitespace-pre-line">
							{transferResult?.success && transferResult
								? `${t('notensammler.nmLfId', 'LF_ID')}: ${transferResult.lfId}\n${t('notensammler.nmSent', 'Übertragen')}: ${transferResult.sentCount}`
								: (error ?? t('notensammler.nmUnknownError', 'Unbekannter Fehler'))}
						</DialogDescription>
					</DialogHeader>

					{transferResult?.success && !!transferResult.confirmation && (
						<div className="rounded-md border bg-muted p-4">
							<h3 className="font-semibold mb-3 text-sm">
								{t('notensammler.nmConfirmation', 'Übertragene Noten')}
							</h3>
							{Array.isArray(transferResult.confirmation) && transferResult.confirmation.length > 0 ? (
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="w-20">{t('notensammler.matrikelnummer', 'Matr.')}</TableHead>
												<TableHead>{t('notensammler.lastName', 'Nachname')}</TableHead>
												<TableHead>{t('notensammler.firstName', 'Vorname')}</TableHead>
												<TableHead className="w-16 text-center">{t('notensammler.note', 'Note')}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{(transferResult.confirmation as Array<{
												Matrikelnummer: number
												Nachname: string
												Vorname: string
												Note: number
												Punkte: number
												Kommentar: string
											}>).map((student, idx) => (
												<TableRow key={student.Matrikelnummer ?? idx}>
													<TableCell className="font-mono text-xs">{student.Matrikelnummer}</TableCell>
													<TableCell>{student.Nachname}</TableCell>
													<TableCell>{student.Vorname}</TableCell>
													<TableCell className="text-center font-semibold">{student.Note}</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							) : (
								<div className="text-sm text-muted-foreground">
									<pre className="whitespace-pre-wrap">{JSON.stringify(transferResult.confirmation, null, 2)}</pre>
								</div>
							)}
						</div>
					)}

					<DialogFooter>
						<Button onClick={() => setShowResultDialog(false)}>
							{t('common.close', 'Schließen')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* LF View Password Dialog */}
			<Dialog open={showLfViewPasswordDialog} onOpenChange={(open) => setShowLfViewPasswordDialog(open)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t('notensammler.nmPasswordTitle', 'Notenmanagement Anmeldung')}</DialogTitle>
						<DialogDescription>
							{t('notensammler.nmPasswordDesc', 'Bitte gib deine Anmeldedaten für Notenmanagement ein.')}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<Input
							type="text"
							value={lfViewUsername}
							onChange={(e) => setLfViewUsername(e.target.value)}
							placeholder={t('notensammler.username', 'Benutzername')}
							autoComplete="username"
						/>
						<Input
							type="password"
							value={lfViewPassword}
							onChange={(e) => setLfViewPassword(e.target.value)}
							placeholder={t('notensammler.password', 'Passwort')}
							autoComplete="current-password"
							onKeyDown={(e) => {
								if (e.key === 'Enter' && lfViewUsername && lfViewPassword && !lfViewLoading) {
									void fetchLfData()
								}
							}}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowLfViewPasswordDialog(false)}>
							{t('common.cancel', 'Abbrechen')}
						</Button>
						<Button
							onClick={() => void fetchLfData()}
							disabled={!lfViewUsername || !lfViewPassword || lfViewLoading}
						>
							{lfViewLoading ? (
								<>
									<Spinner size="sm" className="mr-2" />
									{t('notensammler.loading', 'Lade...')}
								</>
							) : (
								t('common.continue', 'Weiter')
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* LF View Dialog */}
			<Dialog open={showLfViewDialog} onOpenChange={(open) => setShowLfViewDialog(open)}>
				<DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{t('notensammler.lfViewTitle', 'LF Daten')} {selectedLfId && `(LF: ${selectedLfId})`}
						</DialogTitle>
						<DialogDescription>
							{t('notensammler.lfViewDesc', 'Übertragene Noten aus Notenmanagement')}
						</DialogDescription>
					</DialogHeader>

					{lfViewData && Array.isArray(lfViewData) && lfViewData.length > 0 ? (
						<div className="rounded-md border bg-muted p-4">
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-20">{t('notensammler.matrikelnummer', 'Matr.')}</TableHead>
											<TableHead>{t('notensammler.lastName', 'Nachname')}</TableHead>
											<TableHead>{t('notensammler.firstName', 'Vorname')}</TableHead>
											<TableHead className="w-16 text-center">{t('notensammler.note', 'Note')}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{lfViewData.map((student, idx) => (
											<TableRow key={student.Matrikelnummer ?? idx}>
												<TableCell className="font-mono text-xs">{student.Matrikelnummer}</TableCell>
												<TableCell>{student.Nachname}</TableCell>
												<TableCell>{student.Vorname}</TableCell>
												<TableCell className="text-center font-semibold">{student.Note}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</div>
					) : (
						<div className="text-sm text-muted-foreground">
							{t('notensammler.noData', 'Keine Daten verfügbar')}
						</div>
					)}

					<DialogFooter>
						<Button onClick={() => setShowLfViewDialog(false)}>
							{t('common.close', 'Schließen')}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Teacher Grades Confirmation Dialog */}
			<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t('notensammler.deleteTeacherGradesTitle', 'Noten löschen')}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{teacherToDelete && (
								<>
									{t('notensammler.deleteTeacherGradesConfirm', 'Möchtest du wirklich alle Noten für')} <strong>{teacherToDelete.firstName} {teacherToDelete.lastName}</strong> {t('notensammler.deleteTeacherGradesConfirm2', 'löschen?')}
									<br />
									<br />
									{t('notensammler.deleteTeacherGradesWarning', 'Diese Aktion kann nicht rückgängig gemacht werden. Alle Noten für diesen Lehrer in dieser Klasse werden dauerhaft gelöscht.')}
								</>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>
							{t('common.cancel', 'Abbrechen')}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => void deleteTeacherGrades()}
							disabled={deleting}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleting ? (
								<>
									<Spinner size="sm" className="mr-2" />
									{t('notensammler.deleting', 'Lösche...')}
								</>
							) : (
								t('notensammler.delete', 'Löschen')
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

