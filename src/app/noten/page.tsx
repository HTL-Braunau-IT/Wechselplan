'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import { parse, isValid, isWithinInterval, addWeeks } from 'date-fns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Spinner } from '@/components/ui/spinner'
import { StudentPhoto } from '@/components/student-photo'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useEntitlements } from '@/contexts/entitlements-context'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { getStoredToken, storeToken, clearToken } from '@/lib/notenmanagement-token'
import { normalizeUsername } from '@/lib/username'

type TeachingDay = { date: string; period: string }
type Student = { id: number; firstName: string; lastName: string; groupId: number | null; sitzplatz?: string | null }
type ClassItem = { id: number; name: string; groupIds: number[] }
type WeightConfig = {
	weightWiederholung: number
	weightBericht: number
	weightMitarbeit: number
	weightPraktischeArbeit: number
}
type NotenEntryRow = {
	studentId: number
	date: string
	period: string
	attendance: string | null
	wiederholung1: number | null
	wiederholung2: number | null
	bericht1: number | null
	bericht2: number | null
	mitarbeit1: number | null
	mitarbeit2: number | null
	praktischeArbeit1: number | null
	praktischeArbeit2: number | null
	notizen: string | null
}
type SearchByNameMatch = {
	classId: number
	className: string
	groupId: number
	studentId: number
	firstName: string
	lastName: string
}
type SearchByDateMatch = {
	classId: number
	className: string
	groupId: number
	period: string
}

const ATTENDANCE_OPTIONS = ['Anwesend', 'Krank', 'Entschuldigt', 'Unentschuldigt'] as const
const GRADE_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const GRADE_CLEAR_VALUE = '__clear__'

/** Build a readable error from a transfer API response, including the Notenmanagement detail. */
function formatTransferError(data: { error?: string; details?: unknown }): string {
	const detail =
		data.details == null
			? ''
			: typeof data.details === 'string'
				? data.details
				: (data.details as { error_description?: string; error?: string })?.error_description ??
					(data.details as { error?: string })?.error ??
					JSON.stringify(data.details)
	return [data.error, detail].filter(Boolean).join(' — ') || 'Transfer failed'
}
const FINAL_GRADE_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]
const BETRAGEN_OPTIONS = [
	'Sehr zufriedenstellend',
	'Zufriedenstellend',
	'Wenig Zufriedenstellend',
	'Nicht zufriedenstellend'
] as const

const GRADE_BOX_CLASSES: Record<number, string> = {
	1: 'bg-green-100 dark:bg-green-900/40 border-green-200/70 dark:border-green-800/50',
	1.5: 'bg-emerald-100 dark:bg-emerald-900/35 border-emerald-200/70 dark:border-emerald-800/50',
	2: 'bg-lime-100 dark:bg-lime-900/35 border-lime-200/70 dark:border-lime-800/50',
	2.5: 'bg-yellow-100 dark:bg-yellow-900/35 border-yellow-200/70 dark:border-yellow-800/50',
	3: 'bg-yellow-100 dark:bg-yellow-900/35 border-yellow-300/70 dark:border-yellow-700/50',
	3.5: 'bg-amber-100 dark:bg-amber-900/35 border-amber-200/70 dark:border-amber-800/50',
	4: 'bg-orange-100 dark:bg-orange-900/35 border-orange-200/70 dark:border-orange-800/50',
	4.5: 'bg-orange-200 dark:bg-orange-800/40 border-orange-300/70 dark:border-orange-700/50',
	5: 'bg-red-100 dark:bg-red-900/35 border-red-200/70 dark:border-red-800/50'
}

function getGradeBoxClass(grade: number | null): string {
	if (grade == null) return ''
	return GRADE_BOX_CLASSES[grade] ?? ''
}

type FinalGradePerStudent = {
	first: { grade: number | null; conductNoteWish: string | null }
	second: { grade: number | null; conductNoteWish: string | null }
}

function entryKey(studentId: number, date: string, period: string): string {
	return `${studentId}-${date}-${period}`
}

/** dateStr and semesterChangeDate are YYYY-MM-DD (or ISO with time); date >= change = semester 2 */
function isSemester2(dateStr: string, semesterChangeDate: string | undefined): boolean {
	if (!semesterChangeDate) return false
	const change = semesterChangeDate.slice(0, 10)
	return dateStr >= change
}

export type TextModalContentRef = { getValue(): string }

const TextModalContent = forwardRef<TextModalContentRef, { initialValue: string; placeholder: string }>(
	function TextModalContent({ initialValue, placeholder }, ref) {
		const [value, setValue] = useState(initialValue)
		useImperativeHandle(ref, () => ({ getValue: () => value }), [value])
		return (
			<Textarea
				value={value}
				onChange={(ev) => setValue(ev.target.value)}
				className="min-h-[240px] flex-1 w-full resize-y"
				placeholder={placeholder}
				autoFocus
			/>
		)
	}
)

export default function NotenPage() {
	const { t } = useTranslation('common')
	const { selectedYear } = useSchoolYear()
	const { isFeatureEnabled } = useEntitlements()
	const { data: session } = useSession()
	const searchParams = useSearchParams()
	const [classes, setClasses] = useState<ClassItem[]>([])
	const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
	const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
	const [teachingDays, setTeachingDays] = useState<TeachingDay[]>([])
	const [students, setStudents] = useState<Student[]>([])
	const [rowGradeVisibility, setRowGradeVisibility] = useState<Record<number, boolean>>({})
	const [weightConfig, setWeightConfig] = useState<WeightConfig | null>(null)
	const [lehrstoffByDay, setLehrstoffByDay] = useState<Record<string, string>>({})
	const [entries, setEntries] = useState<Record<string, NotenEntryRow>>({})
	const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())
	const [loadingClasses, setLoadingClasses] = useState(true)
	const [loadingGroup, setLoadingGroup] = useState(false)
	const [saving, setSaving] = useState(false)
	const [saveError, setSaveError] = useState<string | null>(null)
	const [finalGrades, setFinalGrades] = useState<Record<number, FinalGradePerStudent>>({})
	const finalGradesRef = React.useRef<Record<number, FinalGradePerStudent>>({})
	finalGradesRef.current = finalGrades
	const [teacherId, setTeacherId] = useState<number | null>(null)
	const [searchText, setSearchText] = useState('')
	const [searchDate, setSearchDate] = useState('')
	const [searchOpen, setSearchOpen] = useState(false)
	const [searchMessage, setSearchMessage] = useState<string | null>(null)
	const [nameMatches, setNameMatches] = useState<SearchByNameMatch[]>([])
	const [activeNameMatchIndex, setActiveNameMatchIndex] = useState(0)
	const [highlightedStudentId, setHighlightedStudentId] = useState<number | null>(null)
	const [focusDateYmd, setFocusDateYmd] = useState<string | null>(null)
	const [dateMatches, setDateMatches] = useState<SearchByDateMatch[]>([])
	const [dateSearchStudentsByGroup, setDateSearchStudentsByGroup] = useState<Record<string, Student[]>>({})
	const [textModal, setTextModal] = useState<
		| { type: 'notizen'; studentId: number; date: string; period: string }
		| { type: 'lehrstoff'; date: string; period: string }
		| null
	>(null)
	const textModalContentRef = useRef<TextModalContentRef | null>(null)

	// Notenmanagement Eintrag Gruppe (group transfer) flow
	const [nmGroupStep, setNmGroupStep] = useState<'semester' | 'list' | null>(null)
	const [nmGroupSemester, setNmGroupSemester] = useState<'first' | 'second' | null>(null)
	const [nmGroupStudents, setNmGroupStudents] = useState<Student[]>([])
	const [nmGroupGrades, setNmGroupGrades] = useState<Record<number, number | null>>({})
	const [nmGroupSaving, setNmGroupSaving] = useState(false)
	const [nmGroupError, setNmGroupError] = useState<string | null>(null)
	const [nmGroupShowPasswordDialog, setNmGroupShowPasswordDialog] = useState(false)
	const [nmGroupUsername, setNmGroupUsername] = useState('')
	const [nmGroupPassword, setNmGroupPassword] = useState('')
	// Student IDs excluded from the transfer (unchecked rows). Empty = transfer everyone.
	const [nmGroupExcluded, setNmGroupExcluded] = useState<Set<number>>(new Set())
	// Bulk "all groups" transfer flow (review-then-confirm). Reuses the password dialog +
	// nmGroupUsername/nmGroupPassword/nmGroupShowPasswordDialog state for credentials.
	const [nmAllStep, setNmAllStep] = useState<'semester' | 'list' | null>(null)
	const [nmAllSemester, setNmAllSemester] = useState<'first' | 'second' | null>(null)
	const [nmAllGroups, setNmAllGroups] = useState<Array<{ groupId: number; students: Student[] }>>([])
	const [nmAllGrades, setNmAllGrades] = useState<Record<number, number | null>>({})
	const [nmAllSaving, setNmAllSaving] = useState(false)
	const [nmAllError, setNmAllError] = useState<string | null>(null)
	const [nmAllExcluded, setNmAllExcluded] = useState<Set<number>>(new Set())

	const schoolYearId = selectedYear?.id ?? null
	const semesterChangeDate = selectedYear?.semesterChangeDate

	const todayYmd = (() => {
		const n = new Date()
		return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
	})()
	const currentPeriod: 'AM' | 'PM' = new Date().getHours() < 12 ? 'AM' : 'PM'
	const todayColumnRef = useRef<HTMLTableCellElement | null>(null)
	const dayColumnRefs = useRef<Record<string, HTMLTableCellElement | null>>({})
	const nameColumnRef = useRef<HTMLTableCellElement | null>(null)
	const studentRowRefs = useRef<Record<number, HTMLTableRowElement | null>>({})
	const sitzplatzCellsRef = useRef<HTMLTableCellElement[]>([])
	const hasScrolledToTodayRef = useRef(false)
	const selectedClassIdRef = useRef<number | null>(null)
	selectedClassIdRef.current = selectedClassId
	const urlParamsAppliedRef = useRef(false)
	const checkboxColumnWidthPx = 40

	// Update sitzplatz column position dynamically based on name column width
	const [sitzplatzLeft, setSitzplatzLeft] = useState<string>('0px')
	useEffect(() => {
		if (!nameColumnRef.current) return
		const nameWidth = nameColumnRef.current.offsetWidth
		setSitzplatzLeft(`${checkboxColumnWidthPx + nameWidth}px`)
	}, [students, teachingDays])

	const TODAY_BG = 'bg-blue-50 dark:bg-blue-950/30'
	const firstTodayIndex = teachingDays.findIndex((d) => d.date === todayYmd)
	const focusColumnKey = useMemo(() => {
		const targetDate = focusDateYmd ?? todayYmd
		const day = teachingDays.find((d) => d.date === targetDate)
		return day ? `${day.date}-${day.period}` : null
	}, [teachingDays, focusDateYmd, todayYmd])

	const { semester1DayKeys, semester2DayKeys } = useMemo(() => {
		const change = semesterChangeDate?.slice(0, 10)
		const s1: string[] = []
		const s2: string[] = []
		for (const d of teachingDays) {
			const key = `${d.date}-${d.period}`
			if (!change) {
				s1.push(key)
				continue
			}
			if (d.date >= change) s2.push(key)
			else s1.push(key)
		}
		return { semester1DayKeys: s1, semester2DayKeys: s2 }
	}, [teachingDays, semesterChangeDate])

	const collapseSemester1 = useCallback(() => {
		setCollapsedDays((prev) => new Set([...prev, ...semester1DayKeys]))
	}, [semester1DayKeys])
	const collapseSemester2 = useCallback(() => {
		setCollapsedDays((prev) => new Set([...prev, ...semester2DayKeys]))
	}, [semester2DayKeys])

	const fetchClasses = useCallback(async () => {
		if (!schoolYearId) return
		setLoadingClasses(true)
		try {
			const res = await fetch(`/api/noten/teacher-classes?schoolYearId=${schoolYearId}`)
			if (!res.ok) return
			const data = (await res.json()) as { classes?: ClassItem[] }
			setClasses(data.classes ?? [])
		} finally {
			setLoadingClasses(false)
		}
	}, [schoolYearId])

	useEffect(() => {
		void fetchClasses()
	}, [fetchClasses])

	// Apply classId/groupId from URL when classes are loaded (e.g. link from teacher overview)
	useEffect(() => {
		if (urlParamsAppliedRef.current || classes.length === 0) return
		const classIdParam = searchParams.get('classId')
		if (!classIdParam) return
		urlParamsAppliedRef.current = true
		const classId = Number(classIdParam)
		if (!Number.isFinite(classId)) return
		const cls = classes.find((c) => c.id === classId)
		if (!cls) return
		const groupIdParam = searchParams.get('groupId')
		const groupId = groupIdParam != null && groupIdParam !== '' ? Number(groupIdParam) : null
		const validGroupId =
			groupId != null && Number.isFinite(groupId) && cls.groupIds.includes(groupId)
				? groupId
				: cls.groupIds[0] ?? null
		setSelectedClassId(cls.id)
		setSelectedGroupId(validGroupId)
	}, [classes, searchParams])

	// Auto-select current class/group using same API and logic as teacher overview (so result always matches)
	useEffect(() => {
		if (searchParams.get('classId')) return
		const teacherName = session?.user?.name
		if (!schoolYearId || classes.length === 0 || !teacherName) return
		let cancelled = false
		void (async () => {
			const now = new Date()
			const today = now.getDay()
			const weekday = today === 0 || today === 6 ? 1 : today
			const period = now.getHours() < 12 ? 'AM' : 'PM'
			const res = await fetch(
				`/api/schedules/data?teacher=${encodeURIComponent(teacherName)}&weekday=${weekday}&schoolYearId=${schoolYearId}`
			)
			if (!res.ok || cancelled) return
			const data = (await res.json()) as {
				schedules?: Array<Array<{ classId: number | null; turns?: Array<{ name: string; weeks: Array<{ date: string; isHoliday?: boolean }> }> }>>
				teacherRotation?: Array<{ teacherId: number; classId: number; period: string; turnId: string; groupId: number }>
				assignments?: Array<{ teacherId: number; classId: number; period: string; groupId: number }>
			}
			if (!data.assignments?.length || !data.schedules?.length || cancelled) {
				if (classes[0]) {
					setSelectedClassId(classes[0].id)
					setSelectedGroupId(classes[0].groupIds[0] ?? null)
				}
				return
			}
			const periodAssignments = data.assignments.filter((a) => a.period === period)
			const currentDate = new Date()
			const getTurnsForClass = (classId: number) => {
				const classSchedule = data.schedules?.find((schedules) =>
					schedules.some((s) => Number(s.classId) === classId)
				)
				return classSchedule?.[0]?.turns
			}
			const getCurrentTurnName = (turns: Array<{ name: string; weeks: Array<{ date: string; isHoliday?: boolean }> }> | undefined): string | null => {
				if (!turns?.length) return null
				for (const turn of turns) {
					const inThisTurn = turn.weeks.some((week) => {
						const parsedDate = parse(week.date, 'dd.MM.yy', new Date())
						if (!isValid(parsedDate)) return false
						const weekEnd = addWeeks(parsedDate, 1)
						return isWithinInterval(currentDate, { start: parsedDate, end: weekEnd })
					})
					if (inThisTurn) return turn.name
				}
				return null
			}
			for (const assignment of periodAssignments) {
				const turns = getTurnsForClass(assignment.classId)
				const turnName = getCurrentTurnName(turns)
				if (turnName && data.teacherRotation?.length) {
					const rotation = data.teacherRotation.find(
						(r) =>
							r.classId === assignment.classId &&
							r.period === period &&
							r.turnId === turnName &&
							Number(r.teacherId) === Number(assignment.teacherId)
					)
					if (rotation) {
						if (!cancelled) {
							setSelectedClassId(rotation.classId)
							setSelectedGroupId(rotation.groupId)
						}
						return
					}
				}
			}
			if (!cancelled && periodAssignments[0]) {
				setSelectedClassId(periodAssignments[0].classId)
				setSelectedGroupId(periodAssignments[0].groupId)
			} else if (classes[0]) {
				setSelectedClassId(classes[0].id)
				setSelectedGroupId(classes[0].groupIds[0] ?? null)
			}
		})()
		return () => { cancelled = true }
	}, [schoolYearId, classes.length, session?.user?.name ?? null, searchParams])

	// When no selection yet, select first class and first group
	useEffect(() => {
		if (searchParams.get('classId')) return
		if (selectedClassId !== null || classes.length === 0) return
		const first = classes[0]
		if (first) {
			setSelectedClassId(first.id)
			setSelectedGroupId(first.groupIds[0] ?? null)
		}
	}, [classes, selectedClassId, searchParams])

	// Fetch teaching days, students, and data when class+group selected
	useEffect(() => {
		if (selectedClassId == null || selectedGroupId == null || !schoolYearId) {
			setTeachingDays([])
			setStudents([])
			setRowGradeVisibility({})
			setWeightConfig(null)
			setLehrstoffByDay({})
			setEntries({})
			setFinalGrades({})
			return
		}
		let cancelled = false
		setLoadingGroup(true)
		void Promise.all([
			fetch(`/api/noten/teaching-days?classId=${selectedClassId}&groupId=${selectedGroupId}&schoolYearId=${schoolYearId}`),
			fetch(`/api/noten/students?classId=${selectedClassId}&groupId=${selectedGroupId}&schoolYearId=${schoolYearId}`),
			fetch(`/api/noten/data?classId=${selectedClassId}&groupId=${selectedGroupId}&schoolYearId=${schoolYearId}`)
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
					}>
				])
				if (cancelled) return
				setTeachingDays(daysData.teachingDays ?? [])
				const fetchedStudents = studentsData.students ?? []
				setStudents(fetchedStudents)
				setRowGradeVisibility(
					Object.fromEntries(fetchedStudents.map((student) => [student.id, true]))
				)
				setWeightConfig(notenData.weightConfig ?? null)
				setLehrstoffByDay(notenData.lehrstoffByDay ?? {})
				setFinalGrades(notenData.finalGrades ?? {})
				setTeacherId(notenData.teacherId ?? null)
				const entriesMap: Record<string, NotenEntryRow> = {}
				for (const e of notenData.entries ?? []) {
					entriesMap[entryKey(e.studentId, e.date, e.period)] = e
				}
				setEntries(entriesMap)
			})
			.finally(() => {
				if (!cancelled) setLoadingGroup(false)
			})
		return () => { cancelled = true }
	}, [selectedClassId, selectedGroupId, schoolYearId])

	const updateEntry = useCallback(
		(studentId: number, date: string, period: string, patch: Partial<NotenEntryRow>) => {
			const key = entryKey(studentId, date, period)
			setEntries((prev) => ({
				...prev,
				[key]: {
					studentId,
					date,
					period,
					attendance: null,
					wiederholung1: null,
					wiederholung2: null,
					bericht1: null,
					bericht2: null,
					mitarbeit1: null,
					mitarbeit2: null,
					praktischeArbeit1: null,
					praktischeArbeit2: null,
					notizen: null,
					...prev[key],
					...patch
				}
			}))
		},
		[]
	)

	const saveEntries = useCallback(
		async (payload: NotenEntryRow[], options?: { skipSaving?: boolean }) => {
			if (!selectedClassId || !selectedGroupId || !schoolYearId) return
			if (!options?.skipSaving) setSaving(true)
			try {
				const res = await fetch('/api/noten/entries', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						classId: selectedClassId,
						groupId: selectedGroupId,
						schoolYearId,
						entries: payload
					})
				})
				if (!res.ok) throw new Error('Save failed')
			} finally {
				if (!options?.skipSaving) setSaving(false)
			}
		},
		[selectedClassId, selectedGroupId, schoolYearId]
	)

	const saveWeights = useCallback(
		async (options?: { skipSaving?: boolean }) => {
			if (!selectedClassId || !selectedGroupId || !schoolYearId || !weightConfig) return
			const sum =
				weightConfig.weightWiederholung +
				weightConfig.weightBericht +
				weightConfig.weightMitarbeit +
				weightConfig.weightPraktischeArbeit
			if (sum !== 100) return
			if (!options?.skipSaving) setSaving(true)
			try {
				const res = await fetch('/api/noten/weights', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						classId: selectedClassId,
						groupId: selectedGroupId,
						schoolYearId,
						...weightConfig
					})
				})
				if (!res.ok) throw new Error('Save failed')
			} finally {
				if (!options?.skipSaving) setSaving(false)
			}
		},
		[selectedClassId, selectedGroupId, schoolYearId, weightConfig]
	)

	const saveLehrstoff = useCallback(
		async (date: string, period: string, value: string, options?: { skipSaving?: boolean }) => {
			if (!selectedClassId || !selectedGroupId || !schoolYearId) return
			if (!options?.skipSaving) setSaving(true)
			try {
				await fetch('/api/noten/lehrstoff', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						classId: selectedClassId,
						groupId: selectedGroupId,
						schoolYearId,
						date,
						period,
						lehrstoff: value
					})
				})
			} finally {
				if (!options?.skipSaving) setSaving(false)
			}
		},
		[selectedClassId, selectedGroupId, schoolYearId]
	)

	const setFinalGrade = useCallback(
		(studentId: number, semester: 'first' | 'second', field: 'grade' | 'conductNoteWish', value: number | string | null) => {
			setFinalGrades((prev) => {
				const cur = prev[studentId] ?? { first: { grade: null, conductNoteWish: null }, second: { grade: null, conductNoteWish: null } }
				const next = { ...prev, [studentId]: { ...cur, [semester]: { ...cur[semester], [field]: value } } }
				return next
			})
		},
		[]
	)

	const saveFinalGrades = useCallback(
		async (
			payload: Array<{
				studentId: number
				semester: 'first' | 'second'
				grade: number | null
				conductNoteWish: string | null
			}>,
			options?: { skipSaving?: boolean }
		) => {
			if (!selectedClassId || !schoolYearId) return
			if (!options?.skipSaving) setSaving(true)
			try {
				const useNotensammler = isFeatureEnabled('notensammler')
				if (useNotensammler && teacherId != null) {
					const gradesRes = await fetch('/api/notensammler/grades/batch', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							classId: selectedClassId,
							schoolYearId,
							grades: payload.map((p) => ({ studentId: p.studentId, teacherId, semester: p.semester, grade: p.grade }))
						})
					})
					if (!gradesRes.ok) throw new Error('Save grades failed')
					const conductPayload = payload.map((p) => ({ studentId: p.studentId, semester: p.semester, conductNoteWish: p.conductNoteWish }))
					const conductRes = await fetch('/api/noten/conduct', {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ classId: selectedClassId, schoolYearId, updates: conductPayload })
					})
					if (!conductRes.ok) throw new Error('Save conduct failed')
				} else if (!useNotensammler) {
					const res = await fetch('/api/noten/final-grades', {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							classId: selectedClassId,
							schoolYearId,
							finalGrades: payload
						})
					})
					if (!res.ok) throw new Error('Save final grades failed')
				}
			} finally {
				if (!options?.skipSaving) setSaving(false)
			}
		},
		[selectedClassId, schoolYearId, teacherId, isFeatureEnabled]
	)

	const setAllAnwesend = useCallback(
		async (date: string, period: string) => {
			if (!selectedClassId || !selectedGroupId || !schoolYearId) return
			setSaving(true)
			try {
				const res = await fetch('/api/noten/set-attendance-day', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						classId: selectedClassId,
						groupId: selectedGroupId,
						schoolYearId,
						date,
						period
					})
				})
				if (!res.ok) return
				students.forEach((s) => updateEntry(s.id, date, period, { attendance: 'Anwesend' }))
			} finally {
				setSaving(false)
			}
		},
		[selectedClassId, selectedGroupId, schoolYearId, students, updateEntry]
	)

	const toggleDayCollapsed = useCallback((date: string, period: string) => {
		const key = `${date}-${period}`
		setCollapsedDays((prev) => {
			const next = new Set(prev)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])

	const collapseAllDays = useCallback(() => {
		setCollapsedDays(new Set(teachingDays.map((d) => `${d.date}-${d.period}`)))
	}, [teachingDays])

	const expandAllDays = useCallback(() => {
		setCollapsedDays(new Set())
	}, [])

	// Auto-collapse semester 1 when the earliest teaching day is in semester 2
	useEffect(() => {
		if (teachingDays.length === 0 || !semesterChangeDate) return
		const first = teachingDays[0]
		if (!first || !isSemester2(first.date, semesterChangeDate)) return
		setCollapsedDays((prev) => new Set([...prev, ...semester1DayKeys]))
	}, [teachingDays, semesterChangeDate, semester1DayKeys])

	useEffect(() => {
		hasScrolledToTodayRef.current = false
	}, [selectedClassId, selectedGroupId, focusDateYmd])

	// Auto-scroll to today/focus date column once when it exists and is in view
	useEffect(() => {
		if (!focusColumnKey || hasScrolledToTodayRef.current) return
		const raf = requestAnimationFrame(() => {
			if (hasScrolledToTodayRef.current) return
			const columnEl =
				dayColumnRefs.current[focusColumnKey] ??
				(focusDateYmd == null ? todayColumnRef.current : null)
			if (columnEl) {
				columnEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
				hasScrolledToTodayRef.current = true
			}
		})
		return () => cancelAnimationFrame(raf)
	}, [focusColumnKey, focusDateYmd])

	const allDaysCollapsed =
		teachingDays.length > 0 &&
		teachingDays.every((d) => collapsedDays.has(`${d.date}-${d.period}`))
	const allRowsVisible =
		students.length > 0 &&
		students.every((student) => rowGradeVisibility[student.id] ?? true)

	const toggleRowGradesVisible = useCallback((studentId: number, checked: boolean) => {
		setRowGradeVisibility((prev) => ({
			...prev,
			[studentId]: checked
		}))
	}, [])

	const setAllRowsVisible = useCallback((visible: boolean) => {
		setRowGradeVisibility(
			Object.fromEntries(students.map((student) => [student.id, visible]))
		)
	}, [students])

	const openNotizenModal = useCallback(
		(studentId: number, date: string, period: string) => {
			setTextModal({ type: 'notizen', studentId, date, period })
		},
		[]
	)

	const openLehrstoffModal = useCallback((date: string, period: string) => {
		setTextModal({ type: 'lehrstoff', date, period })
	}, [])

	const closeTextModal = useCallback(() => {
		if (!textModal) return
		const modalValue = textModalContentRef.current?.getValue() ?? ''
		if (textModal.type === 'notizen') {
			const e = entries[entryKey(textModal.studentId, textModal.date, textModal.period)] ?? {
				studentId: textModal.studentId,
				date: textModal.date,
				period: textModal.period,
				attendance: null,
				wiederholung1: null,
				wiederholung2: null,
				bericht1: null,
				bericht2: null,
				mitarbeit1: null,
				mitarbeit2: null,
				praktischeArbeit1: null,
				praktischeArbeit2: null,
				notizen: null
			}
			updateEntry(textModal.studentId, textModal.date, textModal.period, { notizen: modalValue })
			void saveEntries([{ ...e, notizen: modalValue }])
		} else {
			const key = `${textModal.date}-${textModal.period}`
			setLehrstoffByDay((prev) => ({ ...prev, [key]: modalValue }))
			void saveLehrstoff(textModal.date, textModal.period, modalValue)
		}
		setTextModal(null)
	}, [textModal, entries, updateEntry, saveEntries, saveLehrstoff])

	const defaultWeights = useMemo(
		() =>
			weightConfig ?? {
				weightWiederholung: 25,
				weightBericht: 25,
				weightMitarbeit: 25,
				weightPraktischeArbeit: 25
			},
		[weightConfig]
	)

	const weightSum =
		defaultWeights.weightWiederholung +
		defaultWeights.weightBericht +
		defaultWeights.weightMitarbeit +
		defaultWeights.weightPraktischeArbeit
	const weightsValid = weightSum === 100

	const remainingDays = useMemo(() => {
		const upcoming = teachingDays.filter((d) => d.date > todayYmd)
		const inCurrentPeriod = upcoming.filter((d) => d.period === currentPeriod)
		const inCurrentSemester = upcoming.filter((d) => isSemester2(d.date, semesterChangeDate) === isSemester2(todayYmd, semesterChangeDate))
		return {
			fullYear: upcoming.length,
			semester: inCurrentSemester.length,
			period: inCurrentPeriod.length
		}
	}, [teachingDays, todayYmd, semesterChangeDate, currentPeriod])

	// Per-student: attendance counts and calculated grade (weighted average over days)
	const studentSummary = useMemo(() => {
		const out: Record<
			number,
			{ nichtAnwesend: number; anwesend: number; alle: number; pct: number; calculatedGrade: number | null }
		> = {}
		const totalDays = teachingDays.length
		for (const s of students) {
			let nichtAnwesend = 0
			let anwesend = 0
			const dayGrades: number[] = []
			for (const d of teachingDays) {
				const e = entries[entryKey(s.id, d.date, d.period)]
				const att = e?.attendance ?? null
				if (att === 'Anwesend') anwesend++
				else if (att != null && att !== '') nichtAnwesend++
				else nichtAnwesend++
				const avgW = e?.wiederholung1 != null && e?.wiederholung2 != null ? (e.wiederholung1 + e.wiederholung2) / 2 : (e?.wiederholung1 ?? e?.wiederholung2) ?? null
				const avgB = e?.bericht1 != null && e?.bericht2 != null ? (e.bericht1 + e.bericht2) / 2 : (e?.bericht1 ?? e?.bericht2) ?? null
				const avgM = e?.mitarbeit1 != null && e?.mitarbeit2 != null ? (e.mitarbeit1! + e.mitarbeit2!) / 2 : (e?.mitarbeit1 ?? e?.mitarbeit2) ?? null
				const avgP = e?.praktischeArbeit1 != null && e?.praktischeArbeit2 != null ? (e.praktischeArbeit1! + e.praktischeArbeit2!) / 2 : (e?.praktischeArbeit1 ?? e?.praktischeArbeit2) ?? null
				if (avgW == null && avgB == null && avgM == null && avgP == null) continue
				const div = (avgW != null ? defaultWeights.weightWiederholung : 0) + (avgB != null ? defaultWeights.weightBericht : 0) + (avgM != null ? defaultWeights.weightMitarbeit : 0) + (avgP != null ? defaultWeights.weightPraktischeArbeit : 0)
				if (div === 0) continue
				const dayGrade = ((avgW ?? 0) * defaultWeights.weightWiederholung + (avgB ?? 0) * defaultWeights.weightBericht + (avgM ?? 0) * defaultWeights.weightMitarbeit + (avgP ?? 0) * defaultWeights.weightPraktischeArbeit) / div
				dayGrades.push(dayGrade)
			}
			const calculatedGrade = dayGrades.length > 0 ? Math.round((dayGrades.reduce((a, b) => a + b, 0) / dayGrades.length) * 2) / 2 : null
			const pct = totalDays > 0 ? Math.round((anwesend / totalDays) * 1000) / 10 : 0
			out[s.id] = { nichtAnwesend, anwesend, alle: totalDays, pct, calculatedGrade }
		}
		return out
	}, [students, teachingDays, entries, defaultWeights])

	const saveAll = useCallback(async () => {
		if (!selectedClassId || !selectedGroupId || !schoolYearId) return
		const defaultEntry = (
			studentId: number,
			date: string,
			period: string
		): NotenEntryRow => ({
			studentId,
			date,
			period,
			attendance: null,
			wiederholung1: null,
			wiederholung2: null,
			bericht1: null,
			bericht2: null,
			mitarbeit1: null,
			mitarbeit2: null,
			praktischeArbeit1: null,
			praktischeArbeit2: null,
			notizen: null
		})
		const allEntries: NotenEntryRow[] = students.flatMap((s) =>
			teachingDays.map((d) => {
				const key = entryKey(s.id, d.date, d.period)
				const existing = entries[key]
				return existing ?? defaultEntry(s.id, d.date, d.period)
			})
		)
		setSaveError(null)
		setSaving(true)
		try {
			await saveEntries(allEntries, { skipSaving: true })
			await Promise.all(
				teachingDays.map((d) => {
					const key = `${d.date}-${d.period}`
					return saveLehrstoff(d.date, d.period, lehrstoffByDay[key] ?? '', { skipSaving: true })
				})
			)
			if (weightsValid) await saveWeights({ skipSaving: true })
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : 'Save failed')
		} finally {
			setSaving(false)
		}
	}, [
		selectedClassId,
		selectedGroupId,
		schoolYearId,
		students,
		teachingDays,
		entries,
		lehrstoffByDay,
		weightsValid,
		saveEntries,
		saveLehrstoff,
		saveWeights
	])

	const gotoNameMatch = useCallback((match: SearchByNameMatch) => {
		setFocusDateYmd(null)
		setSelectedClassId(match.classId)
		setSelectedGroupId(match.groupId)
		setHighlightedStudentId(match.studentId)
		setSearchMessage(
			`${match.lastName} ${match.firstName} – ${match.className}, ${t('noten.gruppe')} ${match.groupId}`
		)
	}, [t])

	const performNameSearch = useCallback(async () => {
		const query = searchText.trim()
		if (!query || !schoolYearId) return
		setDateMatches([])
		setDateSearchStudentsByGroup({})
		const res = await fetch(
			`/api/noten/search?schoolYearId=${schoolYearId}&nameQuery=${encodeURIComponent(query)}`
		)
		if (!res.ok) {
			setSearchMessage(t('noten.searchError', { defaultValue: 'Suche fehlgeschlagen.' }))
			return
		}
		const data = (await res.json()) as { byName?: SearchByNameMatch[] }
		const matches = data.byName ?? []
		setNameMatches(matches)
		setActiveNameMatchIndex(0)
		if (matches.length === 0) {
			setHighlightedStudentId(null)
			setSearchMessage(t('noten.searchNoNameResult', { defaultValue: 'Kein passender Schüler gefunden.' }))
			return
		}
		gotoNameMatch(matches[0]!)
	}, [searchText, schoolYearId, t, gotoNameMatch])

	const gotoNextNameMatch = useCallback(() => {
		if (nameMatches.length === 0) return
		const nextIndex = (activeNameMatchIndex + 1) % nameMatches.length
		setActiveNameMatchIndex(nextIndex)
		gotoNameMatch(nameMatches[nextIndex]!)
	}, [nameMatches, activeNameMatchIndex, gotoNameMatch])

	const performDateSearch = useCallback(async () => {
		if (!searchDate || !schoolYearId) return
		setNameMatches([])
		setHighlightedStudentId(null)
		const res = await fetch(
			`/api/noten/search?schoolYearId=${schoolYearId}&dateQuery=${encodeURIComponent(searchDate)}`
		)
		if (!res.ok) {
			setSearchMessage(t('noten.searchError', { defaultValue: 'Suche fehlgeschlagen.' }))
			return
		}
		const data = (await res.json()) as { byDate?: SearchByDateMatch[] }
		const matches = data.byDate ?? []
		setDateMatches(matches)
		setFocusDateYmd(searchDate)
		if (matches.length === 0) {
			setSearchMessage(t('noten.searchNoDateResult', { defaultValue: 'An diesem Datum wurden keine Gruppen gefunden.' }))
			setDateSearchStudentsByGroup({})
			return
		}
		setSearchMessage(
			t('noten.searchDateResultCount', {
				defaultValue: '{{count}} Klassen/Gruppen an diesem Datum gefunden.',
				count: matches.length
			})
		)

		const studentsEntries = await Promise.all(
			matches.map(async (match) => {
				const key = `${match.classId}-${match.groupId}`
				const studentsRes = await fetch(
					`/api/noten/students?classId=${match.classId}&groupId=${match.groupId}&schoolYearId=${schoolYearId}`
				)
				if (!studentsRes.ok) return [key, []] as const
				const studentsData = (await studentsRes.json()) as { students?: Student[] }
				return [key, studentsData.students ?? []] as const
			})
		)
		setDateSearchStudentsByGroup(Object.fromEntries(studentsEntries))
	}, [searchDate, schoolYearId, t])

	useEffect(() => {
		if (!highlightedStudentId) return
		const row = studentRowRefs.current[highlightedStudentId]
		if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
	}, [highlightedStudentId, students, selectedClassId, selectedGroupId])

	if (!isFeatureEnabled('noten')) {
		return null
	}

	if (!schoolYearId) {
		return (
			<div className="container mx-auto p-4">
				<p className="text-muted-foreground">{t('noten.noSchoolYear')}</p>
			</div>
		)
	}

	return (
		<TooltipProvider delayDuration={200}>
		<div className="container mx-auto p-4 space-y-4">
			<h1 className="text-2xl font-bold">{t('navigation.noten')}</h1>

			{loadingClasses ? (
				<Spinner />
			) : classes.length === 0 ? (
				<p className="text-muted-foreground">{t('noten.noClasses')}</p>
			) : (
				<Tabs
					value={selectedClassId?.toString() ?? ''}
					onValueChange={(v) => {
						const id = parseInt(v, 10)
						if (Number.isNaN(id)) return
						const cls = classes.find((c) => c.id === id)
						selectedClassIdRef.current = id
						setSelectedClassId(id)
						const fallbackGroupId = cls?.groupIds?.[0] ?? null
						setSelectedGroupId(fallbackGroupId)
						if (!schoolYearId || !cls) return
						void (async () => {
							try {
								const res = await fetch(
									`/api/noten/auto-select?schoolYearId=${schoolYearId}&classId=${id}`
								)
								if (!res.ok) {
									if (selectedClassIdRef.current === id) setSelectedGroupId(cls.groupIds[0] ?? null)
									return
								}
								const data = (await res.json()) as { classId: number | null; groupId: number | null }
								const groupId =
									data.groupId != null && cls.groupIds.includes(data.groupId)
										? data.groupId
										: cls.groupIds[0] ?? null
								if (selectedClassIdRef.current === id) setSelectedGroupId(groupId)
							} catch {
								if (selectedClassIdRef.current === id) setSelectedGroupId(cls.groupIds[0] ?? null)
							}
						})()
					}}
				>
					<TabsList className="flex flex-wrap gap-2 h-auto p-0 bg-transparent text-foreground">
						{classes.map((cls) => (
							<TabsTrigger
								key={cls.id}
								value={cls.id.toString()}
								className="rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-muted/80 data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-primary data-[state=active]:ring-inset"
							>
								{cls.name}
							</TabsTrigger>
						))}
					</TabsList>

					{classes.map((cls) => (
						<TabsContent key={cls.id} value={cls.id.toString()} className="mt-4">
							<Tabs
								value={selectedGroupId?.toString() ?? ''}
								onValueChange={(v) => setSelectedGroupId(parseInt(v, 10))}
							>
								<TabsList className="mb-4 flex flex-wrap gap-2 h-auto p-0 bg-transparent text-foreground">
									{cls.groupIds.map((gid) => (
										<TabsTrigger
											key={gid}
											value={gid.toString()}
											className="rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-muted/80 data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-primary data-[state=active]:ring-inset"
										>
											{t('noten.gruppe')} {gid}
										</TabsTrigger>
									))}
								</TabsList>

								{cls.groupIds.map((gid) => (
									<TabsContent key={gid} value={gid.toString()} className="mt-2">
										<div className="mb-4 pb-2 border-b border-border flex flex-wrap items-center justify-between gap-2">
											<h2 className="text-base font-semibold text-foreground">
												{cls.name} - {t('noten.gruppe')} {gid}
											</h2>
											<p className="text-xs text-muted-foreground">
												{t('noten.remainingFullYear', { defaultValue: 'Rest Schuljahr' })}: {remainingDays.fullYear} ·{' '}
												{t('noten.remainingSemester', { defaultValue: 'Rest Semester' })}: {remainingDays.semester} ·{' '}
												{t('noten.remainingPeriod', { defaultValue: `Rest ${currentPeriod}` })}: {remainingDays.period}
											</p>
										</div>

										{loadingGroup ? (
											<Spinner />
										) : (
											<>
												<div className="mb-4 rounded-md border p-3 space-y-2">
													<div className="flex items-center justify-between gap-2">
														<p className="text-sm font-medium">
															{t('noten.searchTitle', { defaultValue: 'Suche' })}
														</p>
														<Button
															variant="outline"
															size="sm"
															onClick={() => setSearchOpen((prev) => !prev)}
														>
															{searchOpen
																? t('noten.searchCollapse', { defaultValue: 'Suche ausblenden' })
																: t('noten.searchExpand', { defaultValue: 'Suche einblenden' })}
														</Button>
													</div>
													{searchOpen && (
														<>
															<p className="text-xs text-muted-foreground">
																{t('noten.searchHelp', { defaultValue: 'Suche nach Name (wechselt zur Klasse/Gruppe) oder nach Datum (zeigt alle Klassen/Gruppen dieses Tages).' })}
															</p>
															<div className="flex flex-wrap gap-2">
																<Input
																	value={searchText}
																	onChange={(e) => setSearchText(e.target.value)}
																	placeholder={t('noten.searchNamePlaceholder', { defaultValue: 'Name suchen …' })}
																	className="w-full max-w-xs"
																/>
																<Button variant="outline" size="sm" onClick={() => void performNameSearch()}>
																	{t('noten.searchNameAction', { defaultValue: 'Name suchen' })}
																</Button>
																{nameMatches.length > 1 && (
																	<Button variant="outline" size="sm" onClick={gotoNextNameMatch}>
																		{t('noten.searchNextMatch', { defaultValue: 'Nächster Treffer' })} ({activeNameMatchIndex + 1}/{nameMatches.length})
																	</Button>
																)}
															</div>
															<div className="flex flex-wrap gap-2">
																<Input
																	type="date"
																	value={searchDate}
																	onChange={(e) => setSearchDate(e.target.value)}
																	className="w-full max-w-xs"
																/>
																<Button variant="outline" size="sm" onClick={() => void performDateSearch()}>
																	{t('noten.searchDateAction', { defaultValue: 'Datum suchen' })}
																</Button>
															</div>
															{searchMessage && <p className="text-sm text-muted-foreground">{searchMessage}</p>}
														</>
													)}
												</div>
												{dateMatches.length > 0 && (
													<div className="mb-4 rounded-md border p-3 space-y-3">
														<p className="text-sm font-medium">
															{t('noten.searchDateSectionsTitle', { defaultValue: 'Klassen/Gruppen am gewählten Datum' })}
														</p>
														{dateMatches.map((match) => {
															const key = `${match.classId}-${match.groupId}`
															const sectionStudents = dateSearchStudentsByGroup[key] ?? []
															return (
																<div key={`${key}-${match.period}`} className="rounded border p-2">
																	<div className="flex items-center justify-between gap-2">
																		<p className="text-sm font-medium">
																			{match.className} - {t('noten.gruppe')} {match.groupId} ({match.period})
																		</p>
																		<Button
																			variant="outline"
																			size="sm"
																			onClick={() => {
																				setSelectedClassId(match.classId)
																				setSelectedGroupId(match.groupId)
																			}}
																		>
																			{t('noten.searchOpenGroup', { defaultValue: 'In Tabelle öffnen' })}
																		</Button>
																	</div>
																	{sectionStudents.length === 0 ? (
																		<p className="text-xs text-muted-foreground mt-2">
																			{t('noten.searchNoStudentsInGroup', { defaultValue: 'Keine Schülerdaten für diese Gruppe gefunden.' })}
																		</p>
																	) : (
																		<div className="mt-2 text-xs text-muted-foreground">
																			{sectionStudents.map((s) => `${s.lastName} ${s.firstName}`).join(', ')}
																		</div>
																	)}
																</div>
															)
														})}
													</div>
												)}

												{/* Weights */}
												<div className="flex flex-wrap items-center gap-4 mb-4 p-2 rounded-lg border">
													<span className="text-sm font-medium">{t('noten.weights')}</span>
													<label className="flex items-center gap-1">
														<span className="text-xs">{t('noten.wiederholung')}</span>
														<Input
															type="number"
															min={0}
															max={100}
															className="w-20 min-w-[5rem] h-8"
															value={defaultWeights.weightWiederholung}
															onChange={(e) =>
																setWeightConfig((prev) => ({
																	...defaultWeights,
																	...prev,
																	weightWiederholung: parseInt(e.target.value, 10) || 0
																}))
															}
															onBlur={() => void saveWeights()}
														/>
														%
													</label>
													<label className="flex items-center gap-1">
														<span className="text-xs">{t('noten.bericht')}</span>
														<Input
															type="number"
															min={0}
															max={100}
															className="w-20 min-w-[5rem] h-8"
															value={defaultWeights.weightBericht}
															onChange={(e) =>
																setWeightConfig((prev) => ({
																	...defaultWeights,
																	...prev,
																	weightBericht: parseInt(e.target.value, 10) || 0
																}))
															}
															onBlur={() => void saveWeights()}
														/>
														%
													</label>
													<label className="flex items-center gap-1">
														<span className="text-xs">{t('noten.mitarbeit')}</span>
														<Input
															type="number"
															min={0}
															max={100}
															className="w-20 min-w-[5rem] h-8"
															value={defaultWeights.weightMitarbeit}
															onChange={(e) =>
																setWeightConfig((prev) => ({
																	...defaultWeights,
																	...prev,
																	weightMitarbeit: parseInt(e.target.value, 10) || 0
																}))
															}
															onBlur={() => void saveWeights()}
														/>
														%
													</label>
													<label className="flex items-center gap-1">
														<span className="text-xs">{t('noten.praktischeArbeit')}</span>
														<Input
															type="number"
															min={0}
															max={100}
															className="w-20 min-w-[5rem] h-8"
															value={defaultWeights.weightPraktischeArbeit}
															onChange={(e) =>
																setWeightConfig((prev) => ({
																	...defaultWeights,
																	...prev,
																	weightPraktischeArbeit: parseInt(e.target.value, 10) || 0
																}))
															}
															onBlur={() => void saveWeights()}
														/>
														%
													</label>
													{!weightsValid && (
														<span className="text-destructive text-sm">{t('noten.weightsMustSum100')}</span>
													)}
													{saving && <span className="text-muted-foreground text-sm">{t('common.saving')}</span>}
													{saveError && (
														<span className="text-destructive text-sm">{saveError}</span>
													)}
												</div>
												<div className="flex gap-2 mb-4">
													<Button
														variant="default"
														size="sm"
														onClick={() => void saveAll()}
														disabled={
															saving ||
															!selectedClassId ||
															!selectedGroupId ||
															!schoolYearId
														}
													>
														{t('common.save')}
													</Button>
													<Button
														variant="outline"
														size="sm"
														onClick={allDaysCollapsed ? expandAllDays : collapseAllDays}
														disabled={teachingDays.length === 0}
													>
														{allDaysCollapsed
															? t('noten.expandAllDays', { defaultValue: 'Alle aufklappen' })
															: t('noten.collapseAllDays', { defaultValue: 'Alle Tage zuklappen' })}
													</Button>
													<Button
														variant={allRowsVisible ? 'destructive' : 'default'}
														size="sm"
														onClick={() => setAllRowsVisible(!allRowsVisible)}
														disabled={students.length === 0}
													>
														{allRowsVisible ? 'Verstecke alle Noten' : 'Zeige alle Noten'}
													</Button>
													{isFeatureEnabled('notenmgmt_htl') && selectedGroupId != null && (
														<Button
															variant="outline"
															size="sm"
															onClick={() => {
																setNmGroupStep('semester')
																setNmGroupSemester(null)
																setNmGroupError(null)
															}}
															disabled={!selectedClassId || !schoolYearId}
														>
															{t('noten.notenmanagementEintragGruppe', { n: selectedGroupId, defaultValue: `Notenmanagement Eintrag Gruppe ${selectedGroupId}` })}
														</Button>
													)}
													{isFeatureEnabled('notenmgmt_htl') && cls.groupIds.length > 0 && (
														<Button
															variant="outline"
															size="sm"
															onClick={() => {
																setNmAllStep('semester')
																setNmAllSemester(null)
																setNmAllError(null)
															}}
															disabled={!selectedClassId || !schoolYearId}
														>
															{t('noten.notenmanagementEintragAlle', { defaultValue: 'Notenmanagement Eintrag – Alle Gruppen' })}
														</Button>
													)}
												</div>
												<div className="flex gap-2 mb-4">
													<Button
														variant="outline"
														size="sm"
														onClick={collapseSemester1}
														disabled={teachingDays.length === 0 || !semesterChangeDate || semester1DayKeys.length === 0}
													>
														{t('noten.collapseSemester1', { defaultValue: '1. Semester zuklappen' })}
													</Button>
													<Button
														variant="outline"
														size="sm"
														onClick={collapseSemester2}
														disabled={teachingDays.length === 0 || !semesterChangeDate || semester2DayKeys.length === 0}
													>
														{t('noten.collapseSemester2', { defaultValue: '2. Semester zuklappen' })}
													</Button>
												</div>

												<div className="overflow-x-auto border rounded-md">
													<table className="w-full caption-bottom text-sm border-collapse">
														<TableHeader>
															<TableRow className="[&>th]:border-r [&>th]:border-border">
																<TableHead className="sticky left-0 z-30 min-w-[2.5rem] w-[2.5rem] bg-background py-1.5 px-2 text-center">
																	
																</TableHead>
																<TableHead
																	ref={nameColumnRef}
																	style={{ left: `${checkboxColumnWidthPx}px` }}
																	className="sticky z-20 min-w-[180px] bg-background py-1.5 px-2"
																>
																	{t('noten.name')}
																</TableHead>
																<TableHead ref={(el) => { if (el) sitzplatzCellsRef.current[0] = el }} style={{ left: sitzplatzLeft }} className="sticky z-18 min-w-[3rem] bg-background py-1.5 px-2 border-l border-r border-border h-auto" />
																{teachingDays.map((day, dayIndex) => {
																	const key = `${day.date}-${day.period}`
																	const isCollapsed = collapsedDays.has(key)
																	const isToday = day.date === (focusDateYmd ?? todayYmd)
																	const todayBg = isToday ? ` ${TODAY_BG}` : ''
																	return (
																		<TableHead
																			key={key}
																			ref={(el) => {
																				dayColumnRefs.current[key] = el
																				if (dayIndex === firstTodayIndex) todayColumnRef.current = el
																			}}
																			colSpan={isCollapsed ? 1 : 6}
																			className={
																				isCollapsed
																					? `min-w-0 w-12 max-w-[3rem] bg-muted/30 align-top py-1.5 px-1 border-r-2 border-border${todayBg}`
																					: `min-w-[28rem] bg-muted/30 align-top py-1.5 px-2 border-r border-border${todayBg}`
																			}
																		>
																			<div className="flex items-center gap-1.5 flex-wrap">
																				<Checkbox
																					checked={!isCollapsed}
																					onCheckedChange={() => toggleDayCollapsed(day.date, day.period)}
																					aria-label={isCollapsed ? t('noten.expandDay', { defaultValue: 'Tag aufklappen' }) : t('noten.collapseDay', { defaultValue: 'Tag zuklappen' })}
																				/>
																				<span className="font-medium text-sm">
																					{t('noten.tag')} {dayIndex + 1}
																				</span>
																				<span className="text-xs text-muted-foreground">
																					{isSemester2(day.date, semesterChangeDate)
																						? t('noten.semester2', { defaultValue: '2. Sem.' })
																						: t('noten.semester1', { defaultValue: '1. Sem.' })}
																				</span>
																				{!isCollapsed && (
																					<>
																						<span className="text-xs whitespace-nowrap">
																							{day.date.split('-').reverse().join('.')}
																						</span>
																						<Button
																							size="sm"
																							className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-2"
																							onClick={() => void setAllAnwesend(day.date, day.period)}
																							disabled={saving}
																						>
																							Alle anwesend
																						</Button>
																					</>
																				)}
																			</div>
																		</TableHead>
																	)
																})}
																<TableHead colSpan={9} className="min-w-0 w-[9rem] max-w-[9rem] bg-muted/30 align-top py-1.5 px-0 border-r-2 border-border" />
															</TableRow>
															<TableRow className="border-0 hover:bg-transparent [&>th]:border-r [&>th]:border-border">
																<TableHead className="sticky left-0 z-30 bg-background p-0 min-w-[2.5rem] w-[2.5rem]" />
																<TableHead style={{ left: `${checkboxColumnWidthPx}px` }} className="sticky z-20 bg-background p-0 min-w-[180px]" />
																<TableHead ref={(el) => { if (el) sitzplatzCellsRef.current[1] = el }} style={{ left: sitzplatzLeft }} className="sticky z-18 bg-background p-0.5 text-[10px] font-medium min-w-[3rem] w-[3rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-l border-r border-border">
																	Sitzplatz
																</TableHead>
																{teachingDays.map((day) => {
																	const key = `${day.date}-${day.period}`
																	const isToday = day.date === (focusDateYmd ?? todayYmd)
																	if (collapsedDays.has(key))
																		return (
																			<TableHead key={key} className={`p-0 w-12 min-w-0 max-w-[3rem] border-r-2 border-border h-24 ${isToday ? TODAY_BG : 'bg-background'}`} />
																		)
																	const verticalHeaderClass =
																		'p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border bg-background'
																	const verticalHeaderTodayClass =
																		'p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border'
																	const verticalHeaderLastClass =
																		'p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r-2 border-border bg-background'
																	const verticalHeaderLastTodayClass =
																		'p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r-2 border-border'
																	return (
																		<React.Fragment key={key}>
																			<TableHead className={verticalHeaderClass}>
																				{t('noten.anwesenheit')}
																			</TableHead>
																			<TableHead className={isToday ? verticalHeaderTodayClass + ' ' + TODAY_BG : verticalHeaderClass}>{t('noten.wiederholung')}</TableHead>
																			<TableHead className={isToday ? verticalHeaderTodayClass + ' ' + TODAY_BG : verticalHeaderClass}>{t('noten.bericht')}</TableHead>
																			<TableHead className={isToday ? verticalHeaderTodayClass + ' ' + TODAY_BG : verticalHeaderClass}>{t('noten.mitarbeit')}</TableHead>
																			<TableHead className={isToday ? verticalHeaderTodayClass + ' ' + TODAY_BG : verticalHeaderClass}>
																				{t('noten.praktischeArbeit')}
																			</TableHead>
																			<TableHead className={isToday ? verticalHeaderLastTodayClass + ' ' + TODAY_BG : verticalHeaderLastClass}>{t('noten.notizen')}</TableHead>
																		</React.Fragment>
																	)
																})}
																<TableHead className="p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border bg-background">
																	{t('noten.nichtAnwesendTage', { defaultValue: 'Nicht anwesend' })}
																</TableHead>
																<TableHead className="p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border bg-background">
																	{t('noten.anwesendTage', { defaultValue: 'Anwesend' })}
																</TableHead>
																<TableHead className="p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border bg-background">
																	{t('noten.alleTage', { defaultValue: 'Alle Tage' })}
																</TableHead>
																<TableHead className="p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border bg-background">
																	{t('noten.anwesenheitProzent', { defaultValue: 'Anw. %' })}
																</TableHead>
																<TableHead className="p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border bg-background">
																	{t('noten.gradeBerechnet', { defaultValue: 'Note' })}
																</TableHead>
																<TableHead className="p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border bg-background">
																	{t('noten.endnoteSem1', { defaultValue: 'Endn. 1' })}
																</TableHead>
																<TableHead className="p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border bg-background">
																	{t('noten.betragenSem1', { defaultValue: 'Betr. 1' })}
																</TableHead>
																<TableHead className="p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border bg-background">
																	{t('noten.endnoteSem2', { defaultValue: 'Endn. 2' })}
																</TableHead>
																<TableHead className="p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r-2 border-border bg-background">
																	{t('noten.betragenSem2', { defaultValue: 'Betr. 2' })}
																</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{students.map((student) => (
																<TableRow
																	key={student.id}
																	ref={(el) => { studentRowRefs.current[student.id] = el }}
																	className={highlightedStudentId === student.id ? 'bg-yellow-100/60 dark:bg-yellow-900/20' : ''}
																>
																	{(() => {
																		const isGradesVisible = rowGradeVisibility[student.id] ?? true
																		return (
																			<>
																				<TableCell className="sticky left-0 z-30 bg-background align-top p-1">
																					<div className="flex items-center justify-center pt-1">
																						<Checkbox
																							checked={isGradesVisible}
																							onCheckedChange={(checked) => toggleRowGradesVisible(student.id, checked === true)}
																							aria-label={`Noten anzeigen für ${student.lastName} ${student.firstName}`}
																						/>
																					</div>
																				</TableCell>
																				<TableCell style={{ left: `${checkboxColumnWidthPx}px` }} className="sticky z-20 bg-background align-top">
																		<StudentPhoto
																			studentId={student.id}
																			firstName={student.firstName}
																			lastName={student.lastName}
																			nameFormat="lastFirst"
																		/>
																				</TableCell>
																				<TableCell ref={(el) => { if (el && !sitzplatzCellsRef.current.includes(el)) sitzplatzCellsRef.current.push(el) }} style={{ left: sitzplatzLeft }} className="sticky z-18 bg-background border-l border-r align-top p-1 min-w-[3rem] w-[3rem]">
																		<Input
																			type="text"
																			value={student.sitzplatz ?? ''}
																			onChange={(e) => {
																				void (async () => {
																					try {
																						const res = await fetch('/api/noten/student-sitzplatz', {
																							method: 'PATCH',
																							headers: { 'Content-Type': 'application/json' },
																							body: JSON.stringify({ studentId: student.id, sitzplatz: e.target.value || null })
																						})
																						if (!res.ok) {
																							const error = await res.json()
																							console.error('Failed to update sitzplatz:', error)
																						}
																					} catch (error) {
																						console.error('Error updating sitzplatz:', error)
																					}
																				})()
																				// Update local state immediately for UX
																				setStudents(students.map(s => s.id === student.id ? { ...s, sitzplatz: e.target.value || null } : s))
																			}}
																			placeholder="Platz"
																			className="h-7 w-full text-xs"
																		/>
																				</TableCell>
																	{teachingDays.map((day) => {
																		const key = `${day.date}-${day.period}`
																		const isToday = day.date === (focusDateYmd ?? todayYmd)
																		if (collapsedDays.has(key)) {
																			return (
																				<TableCell
																					key={key}
																					className={`p-0 w-12 min-w-0 max-w-[3rem] border-r-2 border-border ${isToday ? TODAY_BG : ''}`}
																				/>
																			)
																		}
																		const e = entries[entryKey(student.id, day.date, day.period)] ?? {
																			studentId: student.id,
																			date: day.date,
																			period: day.period,
																			attendance: null,
																			wiederholung1: null,
																			wiederholung2: null,
																			bericht1: null,
																			bericht2: null,
																			mitarbeit1: null,
																			mitarbeit2: null,
																			praktischeArbeit1: null,
																			praktischeArbeit2: null,
																			notizen: null
																		}
																		const gradeSelect = (val1: number | null, val2: number | null, key1: keyof NotenEntryRow, key2: keyof NotenEntryRow) => {
																			if (!isGradesVisible) {
																				return (
																					<div className="flex flex-col gap-1">
																						<div className="h-7 min-w-[4.5rem] w-20 rounded-md border border-input bg-muted/40 px-2 text-xs flex items-center justify-center select-none">•••</div>
																						<div className="h-7 min-w-[4.5rem] w-20 rounded-md border border-input bg-muted/40 px-2 text-xs flex items-center justify-center select-none">•••</div>
																					</div>
																				)
																			}
																			return (
																				<div className="flex flex-col gap-1">
																				<Select
																					value={val1?.toString() ?? ''}
																					onValueChange={(v) => {
																						const newVal = (v === GRADE_CLEAR_VALUE || v === '') ? null : parseFloat(v)
																						updateEntry(student.id, day.date, day.period, { [key1]: newVal })
																						void saveEntries([{ ...e, [key1]: newVal }], { skipSaving: true })
																					}}
																				>
																					<SelectTrigger className={`h-7 min-w-[4.5rem] w-20 ${getGradeBoxClass(val1)}`}>
																						<SelectValue placeholder="-" />
																					</SelectTrigger>
																					<SelectContent>
																						<SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>
																						{GRADE_OPTIONS.map((g) => (
																							<SelectItem key={g} value={g.toString()}>
																								{g}
																							</SelectItem>
																						))}
																					</SelectContent>
																				</Select>
																				<Select
																					value={val2?.toString() ?? ''}
																					onValueChange={(v) => {
																						const newVal = (v === GRADE_CLEAR_VALUE || v === '') ? null : parseFloat(v)
																						updateEntry(student.id, day.date, day.period, { [key2]: newVal })
																						void saveEntries([{ ...e, [key2]: newVal }], { skipSaving: true })
																					}}
																				>
																					<SelectTrigger className={`h-7 min-w-[4.5rem] w-20 ${getGradeBoxClass(val2)}`}>
																						<SelectValue placeholder="-" />
																					</SelectTrigger>
																					<SelectContent>
																						<SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>
																						{GRADE_OPTIONS.map((g) => (
																							<SelectItem key={g} value={g.toString()}>
																								{g}
																							</SelectItem>
																						))}
																					</SelectContent>
																				</Select>
																			</div>
																			)
																		}
																		const attendanceBg =
																			e.attendance == null || e.attendance === ''
																				? ''
																				: e.attendance === 'Anwesend'
																					? 'bg-green-100/50 dark:bg-green-900/20'
																					: 'bg-red-100/50 dark:bg-red-900/20'
																		const todayCellBg = isToday ? ` ${TODAY_BG}` : ''
																		return (
																			<React.Fragment key={key}>
																				<TableCell className={`p-1 w-0 ${attendanceBg} border-r border-border/70`}>
																					<Select
																						value={e.attendance ?? ''}
																						onValueChange={(v) => {
																							updateEntry(student.id, day.date, day.period, { attendance: v })
																							void saveEntries([{ ...e, attendance: v }])
																						}}
																					>
																						<SelectTrigger className="h-10 w-12 min-w-12 shrink-0 justify-center px-1.5">
																							<SelectValue placeholder="-">
																								{e.attendance ? e.attendance.charAt(0) : null}
																							</SelectValue>
																						</SelectTrigger>
																						<SelectContent>
																							{ATTENDANCE_OPTIONS.map((opt) => (
																								<SelectItem key={opt} value={opt}>
																									{opt}
																								</SelectItem>
																							))}
																						</SelectContent>
																					</Select>
																				</TableCell>
																				<TableCell className={`p-1 border-r border-border/70${todayCellBg}`}>
																					{gradeSelect(e.wiederholung1, e.wiederholung2, 'wiederholung1', 'wiederholung2')}
																				</TableCell>
																				<TableCell className={`p-1 border-r border-border/70${todayCellBg}`}>
																					{gradeSelect(e.bericht1, e.bericht2, 'bericht1', 'bericht2')}
																				</TableCell>
																				<TableCell className={`p-1 border-r border-border/70${todayCellBg}`}>
																					{gradeSelect(e.mitarbeit1, e.mitarbeit2, 'mitarbeit1', 'mitarbeit2')}
																				</TableCell>
																				<TableCell className={`p-1 border-r border-border/70${todayCellBg}`}>
																					{gradeSelect(
																						e.praktischeArbeit1,
																						e.praktischeArbeit2,
																						'praktischeArbeit1',
																						'praktischeArbeit2'
																					)}
																				</TableCell>
																				<TableCell className={`p-1 border-r-2 border-border w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] overflow-hidden align-top${todayCellBg}`}>
																					{(() => {
																						if (!isGradesVisible) {
																							return (
																								<div className="h-full min-h-[4.5rem] w-full rounded-md border border-input bg-muted/40 px-2 py-1.5 text-sm flex items-center justify-center select-none">
																									•••
																								</div>
																							)
																						}
																						const notizenValue = (e.notizen ?? '').trim()
																						const notizenBtn = (
																							<button
																								type="button"
																								onClick={() => openNotizenModal(student.id, day.date, day.period)}
																								className="block h-full min-h-[4.5rem] w-full max-w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-left text-sm text-foreground shadow-xs hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring overflow-hidden"
																							>
																								<span className="block truncate min-w-0 w-full text-left">
																									{notizenValue || '–'}
																								</span>
																							</button>
																						)
																						if (!notizenValue) return notizenBtn
																						return (
																							<Tooltip delayDuration={200}>
																								<TooltipTrigger asChild>{notizenBtn}</TooltipTrigger>
																								<TooltipContent side="top">{notizenValue}</TooltipContent>
																							</Tooltip>
																						)
																					})()}
																				</TableCell>
																			</React.Fragment>
																		)
																	})}
																	{(() => {
																		const sum = studentSummary[student.id]
																		const fg = finalGrades[student.id] ?? { first: { grade: null, conductNoteWish: null }, second: { grade: null, conductNoteWish: null } }
																		const saveOneStudent = () => {
																			const latest = finalGradesRef.current[student.id] ?? fg
																			void saveFinalGrades([
																				{ studentId: student.id, semester: 'first', grade: latest.first.grade, conductNoteWish: latest.first.conductNoteWish },
																				{ studentId: student.id, semester: 'second', grade: latest.second.grade, conductNoteWish: latest.second.conductNoteWish }
																			])
																		}
																		const endGradeLabel = (g: number) =>
																			g === 6 ? t('noten.gradeGestundet', { defaultValue: 'Gestundet' }) : g === 7 ? t('noten.gradeNichtBeurteilt', { defaultValue: 'Nicht beurteilt' }) : String(g)
																		return (
																			<>
																				<TableCell className="p-1 text-center border-r border-border w-8 min-w-[2rem]">{sum?.nichtAnwesend ?? 0}</TableCell>
																				<TableCell className="p-1 text-center border-r border-border w-8 min-w-[2rem]">{sum?.anwesend ?? 0}</TableCell>
																				<TableCell className="p-1 text-center border-r border-border w-8 min-w-[2rem]">{sum?.alle ?? 0}</TableCell>
																				<TableCell
																					className={`p-1 text-center border-r border-border w-8 min-w-[2rem] ${
																						sum != null
																							? sum.pct < 50
																								? 'text-red-600 font-medium'
																								: sum.pct < 75
																									? 'text-amber-600 font-medium'
																									: ''
																							: ''
																					}`}
																				>
																					{sum != null ? `${sum.pct} %` : '–'}
																				</TableCell>
																				<TableCell className="p-1 text-center border-r border-border w-8 min-w-[2rem]">{isGradesVisible ? (sum?.calculatedGrade ?? '–') : '•••'}</TableCell>
																				<TableCell className="p-1 border-r border-border w-10 min-w-[2.5rem]">
																					{isGradesVisible ? (
																						<Select
																						value={fg.first.grade != null ? String(fg.first.grade) : ''}
																						onValueChange={(v) => setFinalGrade(student.id, 'first', 'grade', (v === GRADE_CLEAR_VALUE || v === '') ? null : parseFloat(v))}
																						onOpenChange={(open) => { if (!open) saveOneStudent() }}
																					>
																						<SelectTrigger className="h-8 w-full min-w-0"><SelectValue placeholder="–" /></SelectTrigger>
																						<SelectContent>
																							<SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>
																							{FINAL_GRADE_OPTIONS.map((g) => (
																								<SelectItem key={g} value={String(g)}>{endGradeLabel(g)}</SelectItem>
																							))}
																						</SelectContent>
																						</Select>
																					) : (
																						<div className="h-8 w-full min-w-0 rounded-md border border-input bg-muted/40 px-2 text-xs flex items-center justify-center select-none">•••</div>
																					)}
																				</TableCell>
																				<TableCell className="p-1 border-r border-border w-10 min-w-[2.5rem]">
																					{isGradesVisible ? (
																						<Select
																						value={fg.first.conductNoteWish ?? ''}
																						onValueChange={(v) => setFinalGrade(student.id, 'first', 'conductNoteWish', v || null)}
																						onOpenChange={(open) => { if (!open) saveOneStudent() }}
																					>
																						<SelectTrigger className="h-8 w-full min-w-0"><SelectValue placeholder="–" /></SelectTrigger>
																						<SelectContent>
																							{BETRAGEN_OPTIONS.map((opt) => (
																								<SelectItem key={opt} value={opt}>{opt}</SelectItem>
																							))}
																						</SelectContent>
																						</Select>
																					) : (
																						<div className="h-8 w-full min-w-0 rounded-md border border-input bg-muted/40 px-2 text-xs flex items-center justify-center select-none">•••</div>
																					)}
																				</TableCell>
																				<TableCell className="p-1 border-r border-border w-10 min-w-[2.5rem]">
																					{isGradesVisible ? (
																						<Select
																						value={fg.second.grade != null ? String(fg.second.grade) : ''}
																						onValueChange={(v) => setFinalGrade(student.id, 'second', 'grade', (v === GRADE_CLEAR_VALUE || v === '') ? null : parseFloat(v))}
																						onOpenChange={(open) => { if (!open) saveOneStudent() }}
																					>
																						<SelectTrigger className="h-8 w-full min-w-0"><SelectValue placeholder="–" /></SelectTrigger>
																						<SelectContent>
																							<SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>
																							{FINAL_GRADE_OPTIONS.map((g) => (
																								<SelectItem key={g} value={String(g)}>{endGradeLabel(g)}</SelectItem>
																							))}
																						</SelectContent>
																						</Select>
																					) : (
																						<div className="h-8 w-full min-w-0 rounded-md border border-input bg-muted/40 px-2 text-xs flex items-center justify-center select-none">•••</div>
																					)}
																				</TableCell>
																				<TableCell className="p-1 border-r-2 border-border w-10 min-w-[2.5rem]">
																					{isGradesVisible ? (
																						<Select
																						value={fg.second.conductNoteWish ?? ''}
																						onValueChange={(v) => setFinalGrade(student.id, 'second', 'conductNoteWish', v || null)}
																						onOpenChange={(open) => { if (!open) saveOneStudent() }}
																					>
																						<SelectTrigger className="h-8 w-full min-w-0"><SelectValue placeholder="–" /></SelectTrigger>
																						<SelectContent>
																							{BETRAGEN_OPTIONS.map((opt) => (
																								<SelectItem key={opt} value={opt}>{opt}</SelectItem>
																							))}
																						</SelectContent>
																						</Select>
																					) : (
																						<div className="h-8 w-full min-w-0 rounded-md border border-input bg-muted/40 px-2 text-xs flex items-center justify-center select-none">•••</div>
																					)}
																				</TableCell>
																			</>
																		)
																	})()}
																			</>
																		)
																	})()}
																</TableRow>
															))}
															<TableRow>
																<TableCell className="sticky left-0 z-10 bg-muted/20 bg-background border-r min-w-[2.5rem] w-[2.5rem]" />
																<TableCell style={{ left: `${checkboxColumnWidthPx}px` }} className="sticky z-10 font-medium bg-muted/30 bg-background border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
																	{t('noten.lehrstoff')}
																</TableCell>
																<TableCell className="p-1 border-r border-border w-[3rem] min-w-[3rem] max-w-[3rem] bg-muted/20" />
																{teachingDays.map((day) => {
																	const key = `${day.date}-${day.period}`
																	const isToday = day.date === (focusDateYmd ?? todayYmd)
																	if (collapsedDays.has(key))
																		return (
																			<TableCell
																				key={key}
																				className={`p-0 w-12 min-w-0 max-w-[3rem] border-r-2 border-border ${isToday ? TODAY_BG : ''}`}
																			/>
																		)
																	return (
																		<TableCell key={key} colSpan={6} className={`p-1 border-r-2 border-border w-[28rem] min-w-[28rem] max-w-[28rem] overflow-hidden ${isToday ? TODAY_BG : ''}`}>
																			{(() => {
																				const lehrstoffValue = (lehrstoffByDay[key] ?? '').trim()
																				const lehrstoffBtn = (
																					<button
																						type="button"
																						onClick={() => openLehrstoffModal(day.date, day.period)}
																						className="block h-full min-h-[4.5rem] w-full max-w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-left text-sm text-foreground shadow-xs hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring overflow-hidden"
																					>
																						<span className="block truncate min-w-0 w-full text-left">
																							{lehrstoffValue || '–'}
																						</span>
																					</button>
																				)
																				if (!lehrstoffValue) return lehrstoffBtn
																				return (
																					<Tooltip delayDuration={200}>
																						<TooltipTrigger asChild>{lehrstoffBtn}</TooltipTrigger>
																						<TooltipContent side="top">{lehrstoffValue}</TooltipContent>
																					</Tooltip>
																				)
																			})()}
																		</TableCell>
																	)
																})}
																<TableCell colSpan={9} className="p-1 border-r-2 border-border bg-muted/20" />
															</TableRow>
														</TableBody>
													</table>
												</div>
											</>
										)}
									</TabsContent>
								))}
							</Tabs>
						</TabsContent>
					))}
				</Tabs>
			)}

			<Dialog
				open={textModal !== null}
				onOpenChange={(open) => {
					if (!open) closeTextModal()
				}}
			>
				<DialogContent className="max-w-md flex flex-col max-h-[85vh]">
					<DialogHeader>
						<DialogTitle>
							{textModal?.type === 'notizen'
								? t('noten.notizen', { defaultValue: 'Notizen' })
								: t('noten.lehrstoff', { defaultValue: 'Lehrstoff' })}
						</DialogTitle>
					</DialogHeader>
					{textModal && (
						<div className="flex flex-1 min-h-0 flex-col pt-1 min-h-[200px]">
							<TextModalContent
								ref={textModalContentRef}
								key={textModal.type === 'notizen' ? `notizen-${textModal.studentId}-${textModal.date}-${textModal.period}` : `lehrstoff-${textModal.date}-${textModal.period}`}
								initialValue={textModal.type === 'notizen' ? (entries[entryKey(textModal.studentId, textModal.date, textModal.period)]?.notizen ?? '') : (lehrstoffByDay[`${textModal.date}-${textModal.period}`] ?? '')}
								placeholder={textModal.type === 'notizen' ? t('noten.notizen', { defaultValue: 'Notizen' }) : t('noten.lehrstoff', { defaultValue: 'Lehrstoff' })}
							/>
						</div>
					)}
					<div className="flex justify-end gap-2 pt-2 shrink-0">
						<Button variant="outline" size="sm" onClick={() => closeTextModal()}>
							{t('common.save', { defaultValue: 'Speichern' })}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Notenmanagement Eintrag Gruppe: Semester choice */}
			<Dialog open={nmGroupStep === 'semester'} onOpenChange={(open) => { if (!open) setNmGroupStep(null) }}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>{t('noten.notenmanagementEintragSemesterTitle', { defaultValue: 'Semester wählen' })}</DialogTitle>
					</DialogHeader>
					<div className="flex gap-2 pt-2">
						<Button
							variant="outline"
							className="flex-1"
							onClick={async () => {
								if (!selectedClassId || !selectedGroupId || !schoolYearId) return
								setNmGroupSemester('first')
								setNmGroupError(null)
								try {
									const res = await fetch(
										`/api/noten/transfer-prefill?classId=${selectedClassId}&schoolYearId=${schoolYearId}&groupId=${selectedGroupId}`
									)
									if (!res.ok) throw new Error('Fetch failed')
									const data = (await res.json()) as {
										students: Student[]
										prefill: Record<number, { first: number | null; second: number | null }>
									}
									setNmGroupStudents(data.students)
									const prefill = data.prefill ?? {}
									const grades: Record<number, number | null> = {}
									for (const s of data.students) {
										const v = prefill[s.id]?.first
										grades[s.id] = v == null ? null : Math.round(v)
									}
									setNmGroupGrades(grades)
									setNmGroupExcluded(new Set())
									setNmGroupStep('list')
								} catch (e) {
									setNmGroupError(e instanceof Error ? e.message : 'Failed')
								}
							}}
						>
							{t('noten.uebertragSem1', { defaultValue: '1. Semester' })}
						</Button>
						<Button
							variant="outline"
							className="flex-1"
							onClick={async () => {
								if (!selectedClassId || !selectedGroupId || !schoolYearId) return
								setNmGroupSemester('second')
								setNmGroupError(null)
								try {
									const res = await fetch(
										`/api/noten/transfer-prefill?classId=${selectedClassId}&schoolYearId=${schoolYearId}&groupId=${selectedGroupId}`
									)
									if (!res.ok) throw new Error('Fetch failed')
									const data = (await res.json()) as {
										students: Student[]
										prefill: Record<number, { first: number | null; second: number | null }>
									}
									setNmGroupStudents(data.students)
									const prefill = data.prefill ?? {}
									const grades: Record<number, number | null> = {}
									for (const s of data.students) {
										const v = prefill[s.id]?.second
										grades[s.id] = v == null ? null : Math.round(v)
									}
									setNmGroupGrades(grades)
									setNmGroupExcluded(new Set())
									setNmGroupStep('list')
								} catch (e) {
									setNmGroupError(e instanceof Error ? e.message : 'Failed')
								}
							}}
						>
							{t('noten.uebertragSem2', { defaultValue: '2. Semester' })}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Notenmanagement Eintrag Gruppe: Student list */}
			<Dialog
				open={nmGroupStep === 'list'}
				onOpenChange={(open) => {
					if (!open) {
						setNmGroupStep(null)
						setNmGroupSemester(null)
						setNmGroupError(null)
					}
				}}
			>
				<DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>{t('noten.notenmanagementEintragListTitle', { defaultValue: 'Notenstand – Schülerliste' })}</DialogTitle>
					</DialogHeader>
					<div className="overflow-auto flex-1 min-h-0 border rounded-md">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[3rem] text-center">{t('noten.uebertragen', { defaultValue: 'Übertragen' })}</TableHead>
									<TableHead className="w-[200px]">{t('noten.name')}</TableHead>
									<TableHead>{t('noten.gradeBerechnet')}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{nmGroupStudents.map((s) => {
									const grade = nmGroupGrades[s.id] ?? null
									const isExcluded = nmGroupExcluded.has(s.id)
									const isMissing = grade == null && !isExcluded
									return (
										<TableRow key={s.id} className={isExcluded ? 'opacity-50' : isMissing ? 'bg-destructive/10' : ''}>
											<TableCell className="text-center">
												<Checkbox
													checked={!isExcluded}
													onCheckedChange={(checked) =>
														setNmGroupExcluded((prev) => {
															const next = new Set(prev)
															if (checked) next.delete(s.id)
															else next.add(s.id)
															return next
														})
													}
													aria-label={t('noten.uebertragen', { defaultValue: 'Übertragen' })}
												/>
											</TableCell>
											<TableCell className="font-medium">
												{s.lastName} {s.firstName}
											</TableCell>
											<TableCell>
												<Select
													disabled={isExcluded}
													value={grade != null ? String(grade) : ''}
													onValueChange={(v) =>
														setNmGroupGrades((prev) => ({
															...prev,
															[s.id]: (v === GRADE_CLEAR_VALUE || v === '') ? null : parseFloat(v)
														}))
													}
												>
													<SelectTrigger className={`w-24 ${isMissing ? 'border-destructive' : ''}`}>
														<SelectValue placeholder={t('noten.uebertragMissing', { defaultValue: '–' })} />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>
														{[1, 2, 3, 4, 5].map((g) => (
															<SelectItem key={g} value={String(g)}>{g}</SelectItem>
														))}
													</SelectContent>
												</Select>
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</div>
					{nmGroupError && <p className="text-destructive text-sm">{nmGroupError}</p>}
					<div className="flex justify-end gap-2 pt-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setNmGroupStep(null)
								setNmGroupSemester(null)
							}}
						>
							{t('common.cancel')}
						</Button>
						<Button
							variant="default"
							size="sm"
							disabled={nmGroupSaving || !nmGroupSemester || !selectedClassId || !selectedGroupId || !schoolYearId}
							onClick={async () => {
								if (!selectedClassId || !selectedGroupId || !schoolYearId || !nmGroupSemester) return
								const storedToken = getStoredToken()
								const defaultUsername = typeof session?.user?.name === 'string' ? session.user.name : ''
								const useStoredToken = storedToken && normalizeUsername(storedToken.username) === normalizeUsername(defaultUsername)
								if (!useStoredToken && !nmGroupPassword) {
									setNmGroupUsername(defaultUsername)
									setNmGroupShowPasswordDialog(true)
									return
								}
								const username = nmGroupUsername || defaultUsername
								const password = nmGroupPassword
								if (!username) {
									setNmGroupError(t('noten.notenmanagementUsernameRequired', { defaultValue: 'Notenmanagement-Benutzername erforderlich.' }))
									return
								}
								if (!useStoredToken && !password) {
									setNmGroupError(t('noten.notenmanagementPasswordRequired', { defaultValue: 'Passwort erforderlich.' }))
									return
								}
								setNmGroupSaving(true)
								setNmGroupError(null)
								try {
									const notesPayload = nmGroupStudents
										.filter((s) => !nmGroupExcluded.has(s.id))
										.map((s) => ({
											studentId: s.id,
											note: nmGroupGrades[s.id] ?? null
										}))
									if (notesPayload.length === 0) {
										setNmGroupError(t('noten.notenmanagementEintragNoStudents', { defaultValue: 'Keine Schüler zum Übertragen ausgewählt.' }))
										setNmGroupSaving(false)
										return
									}
									const res = await fetch('/api/notensammler/transfer', {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({
											classId: selectedClassId,
											groupId: selectedGroupId,
											semester: nmGroupSemester,
											schoolYearId,
											username: normalizeUsername(username) || username,
											...(useStoredToken && storedToken ? { token: storedToken.token } : { password }),
											notes: notesPayload,
											notesByMatrikelnummer: []
										})
									})
									const data = (await res.json()) as { error?: string; details?: unknown; token?: string; tokenExpiresIn?: number }
									if (!res.ok) {
										if (useStoredToken && password) {
											clearToken()
											const retryRes = await fetch('/api/notensammler/transfer', {
												method: 'POST',
												headers: { 'Content-Type': 'application/json' },
												body: JSON.stringify({
													classId: selectedClassId,
													groupId: selectedGroupId,
													semester: nmGroupSemester,
													schoolYearId,
													username: normalizeUsername(username) || username,
													password,
													notes: notesPayload,
													notesByMatrikelnummer: []
												})
											})
											const retryData = (await retryRes.json()) as { error?: string; details?: unknown; token?: string; tokenExpiresIn?: number }
											if (!retryRes.ok) throw new Error(formatTransferError(retryData))
											if (retryData.token && retryData.tokenExpiresIn) {
												storeToken(retryData.token, retryData.tokenExpiresIn, username)
											}
											setNmGroupStep(null)
											setNmGroupSemester(null)
											setNmGroupStudents([])
											setNmGroupGrades({})
											setNmGroupShowPasswordDialog(false)
											setNmGroupPassword('')
											return
										}
										throw new Error(formatTransferError(data))
									}
									if (data.token && data.tokenExpiresIn) {
										storeToken(data.token, data.tokenExpiresIn, username)
									}
									setNmGroupStep(null)
									setNmGroupSemester(null)
									setNmGroupStudents([])
									setNmGroupGrades({})
									setNmGroupShowPasswordDialog(false)
									setNmGroupPassword('')
								} catch (e) {
									setNmGroupError(e instanceof Error ? e.message : 'Transfer failed')
								} finally {
									setNmGroupSaving(false)
								}
							}}
						>
							{nmGroupSaving ? t('common.saving') : t('noten.notenmanagementEintragSubmit', { defaultValue: 'An Notenmanagement übertragen' })}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Notenmanagement Eintrag Alle Gruppen: Semester choice */}
			<Dialog open={nmAllStep === 'semester'} onOpenChange={(open) => { if (!open) setNmAllStep(null) }}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>{t('noten.notenmanagementEintragSemesterTitle', { defaultValue: 'Semester wählen' })}</DialogTitle>
					</DialogHeader>
					<div className="flex gap-2 pt-2">
						{(['first', 'second'] as const).map((sem) => (
							<Button
								key={sem}
								variant="outline"
								className="flex-1"
								onClick={async () => {
									if (!selectedClassId || !schoolYearId) return
									const groupIds = classes.find((c) => c.id === selectedClassId)?.groupIds ?? []
									if (groupIds.length === 0) return
									setNmAllSemester(sem)
									setNmAllError(null)
									try {
										const results = await Promise.all(
											groupIds.map(async (gid) => {
												const res = await fetch(
													`/api/noten/transfer-prefill?classId=${selectedClassId}&schoolYearId=${schoolYearId}&groupId=${gid}`
												)
												if (!res.ok) return { gid, ok: false as const }
												const data = (await res.json()) as {
													students: Student[]
													prefill: Record<number, { first: number | null; second: number | null }>
												}
												return { gid, ok: true as const, students: data.students, prefill: data.prefill ?? {} }
											})
										)
										const groups: Array<{ groupId: number; students: Student[] }> = []
										const grades: Record<number, number | null> = {}
										const failed: number[] = []
										for (const r of results) {
											if (!r.ok) {
												failed.push(r.gid)
												continue
											}
											// Skip groups with no enrolled students: transferring them would POST an
											// empty notes payload and the API rejects it (400 "No matched students").
											if (r.students.length === 0) continue
											groups.push({ groupId: r.gid, students: r.students })
											for (const s of r.students) {
												const v = r.prefill[s.id]?.[sem]
												grades[s.id] = v == null ? null : Math.round(v)
											}
										}
										if (groups.length === 0) {
											setNmAllError(t('noten.notenmanagementEintragAlleNoneLoaded', { defaultValue: 'Keine Gruppe konnte geladen werden.' }))
											return
										}
										setNmAllGroups(groups)
										setNmAllGrades(grades)
										setNmAllExcluded(new Set())
										if (failed.length > 0) {
											setNmAllError(
												t('noten.notenmanagementEintragAlleSomeFailed', {
													groups: failed.join(', '),
													defaultValue: `Gruppen ${failed.join(', ')} konnten nicht geladen werden.`
												})
											)
										}
										setNmAllStep('list')
									} catch (e) {
										setNmAllError(e instanceof Error ? e.message : 'Failed')
									}
								}}
							>
								{sem === 'first'
									? t('noten.uebertragSem1', { defaultValue: '1. Semester' })
									: t('noten.uebertragSem2', { defaultValue: '2. Semester' })}
							</Button>
						))}
					</div>
				</DialogContent>
			</Dialog>

			{/* Notenmanagement Eintrag Alle Gruppen: Combined student list */}
			<Dialog
				open={nmAllStep === 'list'}
				onOpenChange={(open) => {
					if (!open) {
						setNmAllStep(null)
						setNmAllSemester(null)
						setNmAllError(null)
					}
				}}
			>
				<DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>{t('noten.notenmanagementEintragListTitle', { defaultValue: 'Notenstand – Schülerliste' })}</DialogTitle>
					</DialogHeader>
					<div className="overflow-auto flex-1 min-h-0 border rounded-md">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[3rem] text-center">{t('noten.uebertragen', { defaultValue: 'Übertragen' })}</TableHead>
									<TableHead className="w-[200px]">{t('noten.name')}</TableHead>
									<TableHead>{t('noten.gradeBerechnet')}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{nmAllGroups.map((grp) => (
									<React.Fragment key={grp.groupId}>
										<TableRow className="bg-muted/50">
											<TableCell colSpan={3} className="font-semibold">
												{t('noten.gruppe')} {grp.groupId}
											</TableCell>
										</TableRow>
										{grp.students.map((s) => {
											const grade = nmAllGrades[s.id] ?? null
											const isExcluded = nmAllExcluded.has(s.id)
											const isMissing = grade == null && !isExcluded
											return (
												<TableRow key={s.id} className={isExcluded ? 'opacity-50' : isMissing ? 'bg-destructive/10' : ''}>
													<TableCell className="text-center">
														<Checkbox
															checked={!isExcluded}
															onCheckedChange={(checked) =>
																setNmAllExcluded((prev) => {
																	const next = new Set(prev)
																	if (checked) next.delete(s.id)
																	else next.add(s.id)
																	return next
																})
															}
															aria-label={t('noten.uebertragen', { defaultValue: 'Übertragen' })}
														/>
													</TableCell>
													<TableCell className="font-medium">
														{s.lastName} {s.firstName}
													</TableCell>
													<TableCell>
														<Select
															disabled={isExcluded}
															value={grade != null ? String(grade) : ''}
															onValueChange={(v) =>
																setNmAllGrades((prev) => ({
																	...prev,
																	[s.id]: (v === GRADE_CLEAR_VALUE || v === '') ? null : parseFloat(v)
																}))
															}
														>
															<SelectTrigger className={`w-24 ${isMissing ? 'border-destructive' : ''}`}>
																<SelectValue placeholder={t('noten.uebertragMissing', { defaultValue: '–' })} />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>
																{[1, 2, 3, 4, 5].map((g) => (
																	<SelectItem key={g} value={String(g)}>{g}</SelectItem>
																))}
															</SelectContent>
														</Select>
													</TableCell>
												</TableRow>
											)
										})}
									</React.Fragment>
								))}
							</TableBody>
						</Table>
					</div>
					{nmAllError && <p className="text-destructive text-sm">{nmAllError}</p>}
					<div className="flex justify-end gap-2 pt-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setNmAllStep(null)
								setNmAllSemester(null)
							}}
						>
							{t('common.cancel')}
						</Button>
						<Button
							variant="default"
							size="sm"
							disabled={nmAllSaving || !nmAllSemester || !selectedClassId || !schoolYearId || nmAllGroups.length === 0}
							onClick={async () => {
								if (!selectedClassId || !schoolYearId || !nmAllSemester) return
								const storedToken = getStoredToken()
								const defaultUsername = typeof session?.user?.name === 'string' ? session.user.name : ''
								const useStoredToken = storedToken && normalizeUsername(storedToken.username) === normalizeUsername(defaultUsername)
								if (!useStoredToken && !nmGroupPassword) {
									setNmGroupUsername(defaultUsername)
									setNmGroupShowPasswordDialog(true)
									return
								}
								const username = nmGroupUsername || defaultUsername
								const password = nmGroupPassword
								if (!username) {
									setNmAllError(t('noten.notenmanagementUsernameRequired', { defaultValue: 'Notenmanagement-Benutzername erforderlich.' }))
									return
								}
								if (!useStoredToken && !password) {
									setNmAllError(t('noten.notenmanagementPasswordRequired', { defaultValue: 'Passwort erforderlich.' }))
									return
								}
								setNmAllSaving(true)
								setNmAllError(null)
								// Resolve a token once and reuse it for every group to avoid re-auth.
								let token: string | null = useStoredToken && storedToken ? storedToken.token : null
								const transferGroup = async (groupId: number, students: Student[]) => {
									const notesPayload = students
										.filter((s) => !nmAllExcluded.has(s.id))
										.map((s) => ({ studentId: s.id, note: nmAllGrades[s.id] ?? null }))
									// Nothing to send if every student in this group was unchecked.
									if (notesPayload.length === 0) return
									const res = await fetch('/api/notensammler/transfer', {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({
											classId: selectedClassId,
											groupId,
											semester: nmAllSemester,
											schoolYearId,
											username: normalizeUsername(username) || username,
											...(token ? { token } : { password }),
											notes: notesPayload,
											notesByMatrikelnummer: []
										})
									})
									const data = (await res.json()) as { error?: string; details?: unknown; token?: string; tokenExpiresIn?: number }
									if (!res.ok) {
										// Stored token may be stale: fall back to password once if available.
										if (token && password) {
											clearToken()
											token = null
											const retryRes = await fetch('/api/notensammler/transfer', {
												method: 'POST',
												headers: { 'Content-Type': 'application/json' },
												body: JSON.stringify({
													classId: selectedClassId,
													groupId,
													semester: nmAllSemester,
													schoolYearId,
													username: normalizeUsername(username) || username,
													password,
													notes: notesPayload,
													notesByMatrikelnummer: []
												})
											})
											const retryData = (await retryRes.json()) as { error?: string; details?: unknown; token?: string; tokenExpiresIn?: number }
											if (!retryRes.ok) throw new Error(formatTransferError(retryData))
											if (retryData.token && retryData.tokenExpiresIn) {
												storeToken(retryData.token, retryData.tokenExpiresIn, username)
												token = retryData.token
											}
											return
										}
										throw new Error(formatTransferError(data))
									}
									if (data.token && data.tokenExpiresIn) {
										storeToken(data.token, data.tokenExpiresIn, username)
										token = data.token
									}
								}
								try {
									const failed: number[] = []
									for (const grp of nmAllGroups) {
										try {
											await transferGroup(grp.groupId, grp.students)
										} catch {
											failed.push(grp.groupId)
										}
									}
									if (failed.length > 0) {
										setNmAllError(
											t('noten.notenmanagementEintragAlleTransferFailed', {
												groups: failed.join(', '),
												defaultValue: `Übertragung fehlgeschlagen für Gruppen: ${failed.join(', ')}`
											})
										)
										return
									}
									setNmAllStep(null)
									setNmAllSemester(null)
									setNmAllGroups([])
									setNmAllGrades({})
									setNmGroupShowPasswordDialog(false)
									setNmGroupPassword('')
								} finally {
									setNmAllSaving(false)
								}
							}}
						>
							{nmAllSaving ? t('common.saving') : t('noten.notenmanagementEintragSubmit', { defaultValue: 'An Notenmanagement übertragen' })}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Notenmanagement password dialog (when no stored token) */}
			<Dialog
				open={nmGroupShowPasswordDialog}
				onOpenChange={(open) => {
					if (!open) {
						setNmGroupShowPasswordDialog(false)
						setNmGroupPassword('')
					}
				}}
			>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>{t('notensammler.nmPasswordTitle', 'Notenmanagement Anmeldung')}</DialogTitle>
						<DialogDescription>
							{t('notensammler.nmPasswordDesc', 'Bitte gib deine Anmeldedaten für Notenmanagement ein.')}
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2 pt-2">
						<Input
							placeholder={t('noten.username', { defaultValue: 'Benutzername' })}
							value={nmGroupUsername}
							onChange={(e) => setNmGroupUsername(e.target.value)}
						/>
						<Input
							type="password"
							placeholder={t('noten.password', { defaultValue: 'Passwort' })}
							value={nmGroupPassword}
							onChange={(e) => setNmGroupPassword(e.target.value)}
						/>
					</div>
					<div className="flex justify-end gap-2 pt-4">
						<Button variant="outline" size="sm" onClick={() => setNmGroupShowPasswordDialog(false)}>
							{t('common.cancel')}
						</Button>
						<Button
							size="sm"
							disabled={!nmGroupUsername || !nmGroupPassword}
							onClick={() => setNmGroupShowPasswordDialog(false)}
						>
							{t('common.ok', { defaultValue: 'OK' })}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
		</TooltipProvider>
	)
}
