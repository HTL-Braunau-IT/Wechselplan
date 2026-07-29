'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useEntitlements } from '@/contexts/entitlements-context'
import { entryKey, isSemester2 } from '@/lib/grades'
import { emptyEntry, type NotenEntryRow, type SearchByNameMatch, type WeightConfig } from './_lib/types'
import { computeStudentSummary } from './_lib/summary'
import { useNotenClasses } from './_hooks/use-noten-classes'
import { useNotenData } from './_hooks/use-noten-data'
import { useNotenSearch } from './_hooks/use-noten-search'
import { useStickyColumns } from './_hooks/use-sticky-columns'
import { useNmTransfer } from './_hooks/use-nm-transfer'
import { NotenSearchPanel } from './_components/noten-search-panel'
import { WeightsBar } from './_components/weights-bar'
import { NotenGrid } from './_components/noten-grid'
import { TextModal, type TextModalContentRef, type TextModalState } from './_components/text-modal'
import { NmTransferDialog } from './_components/nm-transfer-dialog'

const TAB_TRIGGER_CLASS =
	'rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-muted/80 data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-inset data-[state=active]:ring-primary'

/** Today as YYYY-MM-DD in local time (the dates from the API are local dates). */
function todayLocalYmd(): string {
	const now = new Date()
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Noten — per-lesson assessment for one class/group.
 *
 * A wide grid of teaching days against students, with attendance, four
 * assessment categories, notes and final grades. Class selection, data,
 * search, sticky-column measurement and the Notenmanagement transfer each live
 * in their own hook.
 */
export default function NotenPage() {
	const { t } = useTranslation('common')
	const { selectedYear } = useSchoolYear()
	const { isFeatureEnabled } = useEntitlements()

	const schoolYearId = selectedYear?.id ?? null
	const semesterChangeDate = selectedYear?.semesterChangeDate
	const todayYmd = todayLocalYmd()
	const currentPeriod: 'AM' | 'PM' = new Date().getHours() < 12 ? 'AM' : 'PM'

	const {
		classes,
		loadingClasses,
		selectedClassId,
		setSelectedClassId,
		selectedGroupId,
		setSelectedGroupId,
		selectClass
	} = useNotenClasses(schoolYearId)

	const data = useNotenData({
		classId: selectedClassId,
		groupId: selectedGroupId,
		schoolYearId
	})

	const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())
	const [rowGradeVisibility, setRowGradeVisibility] = useState<Record<number, boolean>>({})
	const [textModal, setTextModal] = useState<TextModalState>(null)
	const textModalContentRef = useRef<TextModalContentRef | null>(null)

	const onSearchNavigate = useCallback(
		(match: SearchByNameMatch) => {
			setSelectedClassId(match.classId)
			setSelectedGroupId(match.groupId)
		},
		[setSelectedClassId, setSelectedGroupId]
	)
	const search = useNotenSearch({ schoolYearId, onNavigate: onSearchNavigate })

	const focusColumnKey = useMemo(() => {
		const target = search.focusDateYmd ?? todayYmd
		const day = data.teachingDays.find((d) => d.date === target)
		return day ? `${day.date}-${day.period}` : null
	}, [data.teachingDays, search.focusDateYmd, todayYmd])

	const { nameColumnRef, sitzplatzLeft, registerDayColumn } = useStickyColumns({
		deps: [data.students, data.teachingDays],
		focusColumnKey,
		resetKey: `${selectedClassId}-${selectedGroupId}-${search.focusDateYmd}`
	})

	const transfer = useNmTransfer({
		classId: selectedClassId,
		schoolYearId,
		selectedGroupId,
		allGroupIds: classes.find((c) => c.id === selectedClassId)?.groupIds ?? []
	})

	const { semester1DayKeys, semester2DayKeys } = useMemo(() => {
		const first: string[] = []
		const second: string[] = []
		for (const day of data.teachingDays) {
			const key = `${day.date}-${day.period}`
			if (isSemester2(day.date, semesterChangeDate)) second.push(key)
			else first.push(key)
		}
		return { semester1DayKeys: first, semester2DayKeys: second }
	}, [data.teachingDays, semesterChangeDate])

	const summary = useMemo(
		() => computeStudentSummary(data.students, data.teachingDays, data.entries, data.weights),
		[data.students, data.teachingDays, data.entries, data.weights]
	)

	const remainingDays = useMemo(() => {
		const upcoming = data.teachingDays.filter((day) => day.date > todayYmd)
		const todayIsSecondSemester = isSemester2(todayYmd, semesterChangeDate)
		return {
			fullYear: upcoming.length,
			semester: upcoming.filter(
				(day) => isSemester2(day.date, semesterChangeDate) === todayIsSecondSemester
			).length,
			period: upcoming.filter((day) => day.period === currentPeriod).length
		}
	}, [data.teachingDays, todayYmd, semesterChangeDate, currentPeriod])

	const allDaysCollapsed =
		data.teachingDays.length > 0 &&
		data.teachingDays.every((day) => collapsedDays.has(`${day.date}-${day.period}`))
	const allRowsVisible =
		data.students.length > 0 &&
		data.students.every((student) => rowGradeVisibility[student.id] ?? true)

	const toggleDayCollapsed = useCallback((date: string, period: string) => {
		setCollapsedDays((prev) => {
			const next = new Set(prev)
			const key = `${date}-${period}`
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])

	const setAllRowsVisible = useCallback(
		(visible: boolean) => {
			setRowGradeVisibility(
				Object.fromEntries(data.students.map((student) => [student.id, visible]))
			)
		},
		[data.students]
	)

	/** Apply a patch to one entry and persist it. */
	const handleEntryChange = useCallback(
		(entry: NotenEntryRow, patch: Partial<NotenEntryRow>) => {
			data.updateEntry(entry.studentId, entry.date, entry.period, patch)
			// Attendance is a deliberate click and shows a saving indicator; the
			// grade selects fire often enough that the indicator would just flicker.
			const skipSaving = !('attendance' in patch)
			void data.saveEntries([{ ...entry, ...patch }], { skipSaving })
		},
		[data]
	)

	const handleFinalGradeCommit = useCallback(
		(studentId: number) => {
			const latest = data.finalGradesRef.current[studentId]
			if (!latest) return
			void data.saveFinalGrades([
				{
					studentId,
					semester: 'first',
					grade: latest.first.grade,
					conductNoteWish: latest.first.conductNoteWish
				},
				{
					studentId,
					semester: 'second',
					grade: latest.second.grade,
					conductNoteWish: latest.second.conductNoteWish
				}
			])
		},
		[data]
	)

	const textModalInitialValue = useMemo(() => {
		if (!textModal) return ''
		if (textModal.type === 'notizen') {
			return (
				data.entries[entryKey(textModal.studentId, textModal.date, textModal.period)]?.notizen ?? ''
			)
		}
		return data.lehrstoffByDay[`${textModal.date}-${textModal.period}`] ?? ''
	}, [textModal, data.entries, data.lehrstoffByDay])

	const closeTextModal = useCallback(() => {
		if (!textModal) return
		const value = textModalContentRef.current?.getValue() ?? ''

		if (textModal.type === 'notizen') {
			// The day may have no entry yet — the note itself is what creates it.
			const existing =
				data.entries[entryKey(textModal.studentId, textModal.date, textModal.period)] ??
				emptyEntry(textModal.studentId, textModal.date, textModal.period)
			data.updateEntry(textModal.studentId, textModal.date, textModal.period, { notizen: value })
			void data.saveEntries([{ ...existing, notizen: value }])
		} else {
			const key = `${textModal.date}-${textModal.period}`
			data.setLehrstoffByDay((prev) => ({ ...prev, [key]: value }))
			void data.saveLehrstoff(textModal.date, textModal.period, value)
		}
		setTextModal(null)
	}, [textModal, data])

	const handleWeightChange = useCallback(
		(key: keyof WeightConfig, value: number) => {
			data.setWeightConfig((prev) => ({ ...data.weights, ...prev, [key]: value }))
		},
		[data]
	)

	if (!isFeatureEnabled('noten')) return null

	if (!schoolYearId) {
		return (
			<div className="container mx-auto p-4">
				<p className="text-muted-foreground">{t('noten.noSchoolYear')}</p>
			</div>
		)
	}

	const selectedClass = classes.find((cls) => cls.id === selectedClassId)
	const canTransfer = isFeatureEnabled('notenmgmt_htl') && selectedClassId != null

	return (
		<TooltipProvider delayDuration={200}>
			<div className="container mx-auto space-y-4 p-4">
				<h1 className="text-2xl font-bold">{t('navigation.noten')}</h1>

				{loadingClasses ? (
					<Spinner />
				) : classes.length === 0 ? (
					<p className="text-muted-foreground">{t('noten.noClasses')}</p>
				) : (
					<>
						<Tabs
							value={selectedClassId?.toString() ?? ''}
							onValueChange={(value) => {
								const id = parseInt(value, 10)
								if (!Number.isNaN(id)) selectClass(id)
							}}
						>
							<TabsList className="flex h-auto flex-wrap gap-2 bg-transparent p-0 text-foreground">
								{classes.map((cls) => (
									<TabsTrigger key={cls.id} value={cls.id.toString()} className={TAB_TRIGGER_CLASS}>
										{cls.name}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>

						{selectedClass && (
							<Tabs
								value={selectedGroupId?.toString() ?? ''}
								onValueChange={(value) => setSelectedGroupId(parseInt(value, 10))}
							>
								<TabsList className="mb-4 flex h-auto flex-wrap gap-2 bg-transparent p-0 text-foreground">
									{selectedClass.groupIds.map((groupId) => (
										<TabsTrigger
											key={groupId}
											value={groupId.toString()}
											className={TAB_TRIGGER_CLASS}
										>
											{t('noten.gruppe')} {groupId}
										</TabsTrigger>
									))}
								</TabsList>
							</Tabs>
						)}

						{selectedClass && selectedGroupId != null && (
							<>
								<div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
									<h2 className="text-base font-semibold text-foreground">
										{selectedClass.name} - {t('noten.gruppe')} {selectedGroupId}
									</h2>
									<p className="text-xs text-muted-foreground">
										{t('noten.remainingFullYear', { defaultValue: 'Rest Schuljahr' })}:{' '}
										{remainingDays.fullYear} ·{' '}
										{t('noten.remainingSemester', { defaultValue: 'Rest Semester' })}:{' '}
										{remainingDays.semester} ·{' '}
										{t('noten.remainingPeriod', { defaultValue: `Rest ${currentPeriod}` })}:{' '}
										{remainingDays.period}
									</p>
								</div>

								{data.loading ? (
									<Spinner />
								) : (
									<>
										<NotenSearchPanel
											open={search.open}
											setOpen={search.setOpen}
											searchText={search.searchText}
											setSearchText={search.setSearchText}
											searchDate={search.searchDate}
											setSearchDate={search.setSearchDate}
											message={search.message}
											nameMatchCount={search.nameMatches.length}
											activeNameMatchIndex={search.activeNameMatchIndex}
											onNameSearch={() => void search.performNameSearch()}
											onNextNameMatch={search.gotoNextNameMatch}
											onDateSearch={() => void search.performDateSearch()}
											dateMatches={search.dateMatches}
											studentsByGroup={search.studentsByGroup}
											onOpenGroup={(classId, groupId) => {
												setSelectedClassId(classId)
												setSelectedGroupId(groupId)
											}}
										/>

										<WeightsBar
											weights={data.weights}
											weightsValid={data.weightsValid}
											saving={data.saving}
											saveError={data.saveError}
											onChange={handleWeightChange}
											onCommit={() => void data.saveWeights()}
										/>

										<div className="mb-4 flex flex-wrap gap-2">
											<Button
												size="sm"
												onClick={() => void data.saveAll()}
												disabled={data.saving || selectedGroupId == null}
											>
												{t('common.save')}
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setCollapsedDays(
														allDaysCollapsed
															? new Set()
															: new Set(
																	data.teachingDays.map((day) => `${day.date}-${day.period}`)
																)
													)
												}
												disabled={data.teachingDays.length === 0}
											>
												{allDaysCollapsed
													? t('noten.expandAllDays', { defaultValue: 'Alle aufklappen' })
													: t('noten.collapseAllDays', { defaultValue: 'Alle Tage zuklappen' })}
											</Button>
											<Button
												variant={allRowsVisible ? 'destructive' : 'default'}
												size="sm"
												onClick={() => setAllRowsVisible(!allRowsVisible)}
												disabled={data.students.length === 0}
											>
												{allRowsVisible
													? t('noten.hideAllGrades', { defaultValue: 'Verstecke alle Noten' })
													: t('noten.showAllGrades', { defaultValue: 'Zeige alle Noten' })}
											</Button>
											{canTransfer && (
												<Button variant="outline" size="sm" onClick={() => transfer.start('group')}>
													{t('noten.notenmanagementEintragGruppe', {
														n: selectedGroupId,
														defaultValue: `Notenmanagement Eintrag Gruppe ${selectedGroupId}`
													})}
												</Button>
											)}
											{canTransfer && selectedClass.groupIds.length > 0 && (
												<Button variant="outline" size="sm" onClick={() => transfer.start('all')}>
													{t('noten.notenmanagementEintragAlle', {
														defaultValue: 'Notenmanagement Eintrag – Alle Gruppen'
													})}
												</Button>
											)}
										</div>

										<div className="mb-4 flex gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setCollapsedDays((prev) => new Set([...prev, ...semester1DayKeys]))
												}
												disabled={!semesterChangeDate || semester1DayKeys.length === 0}
											>
												{t('noten.collapseSemester1', { defaultValue: '1. Semester zuklappen' })}
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setCollapsedDays((prev) => new Set([...prev, ...semester2DayKeys]))
												}
												disabled={!semesterChangeDate || semester2DayKeys.length === 0}
											>
												{t('noten.collapseSemester2', { defaultValue: '2. Semester zuklappen' })}
											</Button>
										</div>

										<NotenGrid
											teachingDays={data.teachingDays}
											students={data.students}
											entries={data.entries}
											lehrstoffByDay={data.lehrstoffByDay}
											finalGrades={data.finalGrades}
											summary={summary}
											collapsedDays={collapsedDays}
											rowGradeVisibility={rowGradeVisibility}
											highlightedStudentId={search.highlightedStudentId}
											focusDateYmd={search.focusDateYmd}
											todayYmd={todayYmd}
											semesterChangeDate={semesterChangeDate}
											saving={data.saving}
											sitzplatzLeft={sitzplatzLeft}
											nameColumnRef={nameColumnRef}
											registerDayColumn={registerDayColumn}
											studentRowRefs={search.studentRowRefs}
											onToggleDay={toggleDayCollapsed}
											onToggleRowVisible={(studentId, visible) =>
												setRowGradeVisibility((prev) => ({ ...prev, [studentId]: visible }))
											}
											onSetAllAnwesend={(date, period) => void data.setAllAnwesend(date, period)}
											onEntryChange={handleEntryChange}
											onSitzplatzChange={(studentId, value) =>
												void data.updateSitzplatz(studentId, value)
											}
											onFinalGradeChange={data.setFinalGrade}
											onFinalGradeCommit={handleFinalGradeCommit}
											onOpenNotizen={(studentId, date, period) =>
												setTextModal({ type: 'notizen', studentId, date, period })
											}
											onOpenLehrstoff={(date, period) =>
												setTextModal({ type: 'lehrstoff', date, period })
											}
										/>
									</>
								)}
							</>
						)}
					</>
				)}

				<TextModal
					state={textModal}
					initialValue={textModalInitialValue}
					contentRef={textModalContentRef}
					onClose={closeTextModal}
				/>

				<NmTransferDialog {...transfer} />
			</div>
		</TooltipProvider>
	)
}
