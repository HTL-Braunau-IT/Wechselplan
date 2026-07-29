'use client'

import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StudentPhoto } from '@/components/student-photo'
import { cn } from '@/lib/utils'
import {
	ATTENDANCE_OPTIONS,
	GRADE_CLEAR_VALUE,
	GRADE_OPTIONS,
	entryKey,
	getGradeBoxClass,
	isSemester2
} from '@/lib/grades'
import { CHECKBOX_COLUMN_WIDTH_PX } from '../_hooks/use-sticky-columns'
import {
	emptyEntry,
	type FinalGradePerStudent,
	type NotenEntryRow,
	type Student,
	type TeachingDay
} from '../_lib/types'
import type { StudentSummary } from '../_lib/summary'

const TODAY_BG = 'bg-blue-50 dark:bg-blue-950/30'
const HIDDEN_PLACEHOLDER = '•••'
/** Marks Notenmanagement treats as labels rather than numbers. */
const FINAL_GRADE_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]
const BETRAGEN_OPTIONS = [
	'Sehr zufriedenstellend',
	'Zufriedenstellend',
	'Wenig Zufriedenstellend',
	'Nicht zufriedenstellend'
] as const

const VERTICAL_HEAD =
	'p-0.5 text-[10px] font-medium min-w-[4.5rem] w-[4.5rem] h-24 align-bottom [writing-mode:vertical-rl] [text-orientation:mixed] border-r border-border'

/** Stand-in shown when a row's grades are hidden. */
function Hidden({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				'flex select-none items-center justify-center rounded-md border border-input bg-muted/40 px-2 text-xs',
				className
			)}
		>
			{HIDDEN_PLACEHOLDER}
		</div>
	)
}

/** Two stacked mark selects for one assessment category. */
function CategoryGrades({
	visible,
	first,
	second,
	onChange
}: {
	visible: boolean
	first: number | null
	second: number | null
	onChange: (slot: 1 | 2, value: number | null) => void
}) {
	if (!visible) {
		return (
			<div className="flex flex-col gap-1">
				<Hidden className="h-7 w-20 min-w-[4.5rem]" />
				<Hidden className="h-7 w-20 min-w-[4.5rem]" />
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-1">
			{([1, 2] as const).map((slot) => {
				const value = slot === 1 ? first : second
				return (
					<Select
						key={slot}
						value={value?.toString() ?? ''}
						onValueChange={(v) =>
							onChange(slot, v === GRADE_CLEAR_VALUE || v === '' ? null : parseFloat(v))
						}
					>
						<SelectTrigger className={cn('h-7 w-20 min-w-[4.5rem]', getGradeBoxClass(value))}>
							<SelectValue placeholder="-" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>
							{GRADE_OPTIONS.map((grade) => (
								<SelectItem key={grade} value={grade.toString()}>
									{grade}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)
			})}
		</div>
	)
}

/** Truncating button that reveals its full text on hover. */
function TruncatedTextButton({
	value,
	onClick,
	className
}: {
	value: string
	onClick: () => void
	className?: string
}) {
	const button = (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'block h-full min-h-[4.5rem] w-full max-w-full overflow-hidden rounded-md border border-input bg-transparent px-2 py-1.5 text-left text-sm text-foreground shadow-xs hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring',
				className
			)}
		>
			<span className="block w-full min-w-0 truncate text-left">{value || '–'}</span>
		</button>
	)

	if (!value) return button
	return (
		<Tooltip delayDuration={200}>
			<TooltipTrigger asChild>{button}</TooltipTrigger>
			<TooltipContent side="top">{value}</TooltipContent>
		</Tooltip>
	)
}

export type NotenGridProps = {
	teachingDays: TeachingDay[]
	students: Student[]
	entries: Record<string, NotenEntryRow>
	lehrstoffByDay: Record<string, string>
	finalGrades: Record<number, FinalGradePerStudent>
	summary: Record<number, StudentSummary>
	collapsedDays: Set<string>
	rowGradeVisibility: Record<number, boolean>
	highlightedStudentId: number | null
	focusDateYmd: string | null
	todayYmd: string
	semesterChangeDate: string | undefined
	saving: boolean
	sitzplatzLeft: string
	nameColumnRef: React.RefObject<HTMLTableCellElement | null>
	registerDayColumn: (key: string, isToday: boolean) => (el: HTMLTableCellElement | null) => void
	studentRowRefs: React.RefObject<Record<number, HTMLTableRowElement | null>>
	onToggleDay: (date: string, period: string) => void
	onToggleRowVisible: (studentId: number, visible: boolean) => void
	onSetAllAnwesend: (date: string, period: string) => void
	onEntryChange: (entry: NotenEntryRow, patch: Partial<NotenEntryRow>) => void
	onSitzplatzChange: (studentId: number, value: string | null) => void
	onFinalGradeChange: (
		studentId: number,
		semester: 'first' | 'second',
		field: 'grade' | 'conductNoteWish',
		value: number | string | null
	) => void
	onFinalGradeCommit: (studentId: number) => void
	onOpenNotizen: (studentId: number, date: string, period: string) => void
	onOpenLehrstoff: (date: string, period: string) => void
}

/**
 * The Noten grid: one column block per teaching day, plus per-student totals
 * and final grades. Days can be collapsed to a narrow spacer column.
 */
export function NotenGrid(props: NotenGridProps) {
	const { t } = useTranslation('common')
	const {
		teachingDays,
		students,
		entries,
		lehrstoffByDay,
		finalGrades,
		summary,
		collapsedDays,
		rowGradeVisibility,
		highlightedStudentId,
		focusDateYmd,
		todayYmd,
		semesterChangeDate,
		saving,
		sitzplatzLeft,
		nameColumnRef,
		registerDayColumn,
		studentRowRefs,
		onToggleDay,
		onToggleRowVisible,
		onSetAllAnwesend,
		onEntryChange,
		onSitzplatzChange,
		onFinalGradeChange,
		onFinalGradeCommit,
		onOpenNotizen,
		onOpenLehrstoff
	} = props

	const focusDate = focusDateYmd ?? todayYmd
	const firstTodayIndex = teachingDays.findIndex((day) => day.date === todayYmd)

	const endGradeLabel = (grade: number) =>
		grade === 6
			? t('noten.gradeGestundet', { defaultValue: 'Gestundet' })
			: grade === 7
				? t('noten.gradeNichtBeurteilt', { defaultValue: 'Nicht beurteilt' })
				: String(grade)

	const summaryHeadings = [
		t('noten.nichtAnwesendTage', { defaultValue: 'Nicht anwesend' }),
		t('noten.anwesendTage', { defaultValue: 'Anwesend' }),
		t('noten.alleTage', { defaultValue: 'Alle Tage' }),
		t('noten.anwesenheitProzent', { defaultValue: 'Anw. %' }),
		t('noten.gradeBerechnet', { defaultValue: 'Note' }),
		t('noten.endnoteSem1', { defaultValue: 'Endn. 1' }),
		t('noten.betragenSem1', { defaultValue: 'Betr. 1' }),
		t('noten.endnoteSem2', { defaultValue: 'Endn. 2' }),
		t('noten.betragenSem2', { defaultValue: 'Betr. 2' })
	]

	/** A final-grade or Betragensnote select, or its hidden stand-in. */
	const finalSelect = (
		studentId: number,
		visible: boolean,
		semester: 'first' | 'second',
		field: 'grade' | 'conductNoteWish',
		value: number | string | null
	) => {
		if (!visible) return <Hidden className="h-8 w-full min-w-0" />
		const isGrade = field === 'grade'
		return (
			<Select
				value={value != null ? String(value) : ''}
				onValueChange={(v) =>
					onFinalGradeChange(
						studentId,
						semester,
						field,
						isGrade ? (v === GRADE_CLEAR_VALUE || v === '' ? null : parseFloat(v)) : v || null
					)
				}
				onOpenChange={(open) => {
					if (!open) onFinalGradeCommit(studentId)
				}}
			>
				<SelectTrigger className="h-8 w-full min-w-0">
					<SelectValue placeholder="–" />
				</SelectTrigger>
				<SelectContent>
					{isGrade && <SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>}
					{isGrade
						? FINAL_GRADE_OPTIONS.map((grade) => (
								<SelectItem key={grade} value={String(grade)}>
									{endGradeLabel(grade)}
								</SelectItem>
							))
						: BETRAGEN_OPTIONS.map((option) => (
								<SelectItem key={option} value={option}>
									{option}
								</SelectItem>
							))}
				</SelectContent>
			</Select>
		)
	}

	return (
		<div className="overflow-x-auto rounded-md border">
			<table className="w-full caption-bottom border-collapse text-sm">
				<TableHeader>
					<TableRow className="[&>th]:border-r [&>th]:border-border">
						<TableHead className="sticky left-0 z-30 w-[2.5rem] min-w-[2.5rem] bg-background px-2 py-1.5 text-center" />
						<TableHead
							ref={nameColumnRef}
							style={{ left: `${CHECKBOX_COLUMN_WIDTH_PX}px` }}
							className="sticky z-20 min-w-[180px] bg-background px-2 py-1.5"
						>
							{t('noten.name')}
						</TableHead>
						<TableHead
							style={{ left: sitzplatzLeft }}
							className="z-18 sticky h-auto min-w-[3rem] border-l border-r border-border bg-background px-2 py-1.5"
						/>
						{teachingDays.map((day, dayIndex) => {
							const key = `${day.date}-${day.period}`
							const isCollapsed = collapsedDays.has(key)
							const isToday = day.date === focusDate
							return (
								<TableHead
									key={key}
									ref={registerDayColumn(key, dayIndex === firstTodayIndex)}
									colSpan={isCollapsed ? 1 : 6}
									className={cn(
										'bg-muted/30 align-top',
										isCollapsed
											? 'w-12 min-w-0 max-w-[3rem] border-r-2 border-border px-1 py-1.5'
											: 'min-w-[28rem] border-r border-border px-2 py-1.5',
										isToday && TODAY_BG
									)}
								>
									<div className="flex flex-wrap items-center gap-1.5">
										<Checkbox
											checked={!isCollapsed}
											onCheckedChange={() => onToggleDay(day.date, day.period)}
											aria-label={
												isCollapsed
													? t('noten.expandDay', { defaultValue: 'Tag aufklappen' })
													: t('noten.collapseDay', { defaultValue: 'Tag zuklappen' })
											}
										/>
										<span className="text-sm font-medium">
											{t('noten.tag')} {dayIndex + 1}
										</span>
										<span className="text-xs text-muted-foreground">
											{isSemester2(day.date, semesterChangeDate)
												? t('noten.semester2', { defaultValue: '2. Sem.' })
												: t('noten.semester1', { defaultValue: '1. Sem.' })}
										</span>
										{!isCollapsed && (
											<>
												<span className="whitespace-nowrap text-xs">
													{day.date.split('-').reverse().join('.')}
												</span>
												<Button
													size="sm"
													className="h-7 bg-green-600 px-2 text-xs text-white hover:bg-green-700"
													onClick={() => onSetAllAnwesend(day.date, day.period)}
													disabled={saving}
												>
													{t('noten.allPresent', { defaultValue: 'Alle anwesend' })}
												</Button>
											</>
										)}
									</div>
								</TableHead>
							)
						})}
						<TableHead
							colSpan={9}
							className="w-[9rem] min-w-0 max-w-[9rem] border-r-2 border-border bg-muted/30 px-0 py-1.5 align-top"
						/>
					</TableRow>

					<TableRow className="border-0 hover:bg-transparent [&>th]:border-r [&>th]:border-border">
						<TableHead className="sticky left-0 z-30 w-[2.5rem] min-w-[2.5rem] bg-background p-0" />
						<TableHead
							style={{ left: `${CHECKBOX_COLUMN_WIDTH_PX}px` }}
							className="sticky z-20 min-w-[180px] bg-background p-0"
						/>
						<TableHead
							style={{ left: sitzplatzLeft }}
							className={cn(VERTICAL_HEAD, 'z-18 sticky w-[3rem] min-w-[3rem] border-l bg-background')}
						>
							{t('noten.sitzplatz', { defaultValue: 'Sitzplatz' })}
						</TableHead>
						{teachingDays.map((day) => {
							const key = `${day.date}-${day.period}`
							const isToday = day.date === focusDate
							if (collapsedDays.has(key)) {
								return (
									<TableHead
										key={key}
										className={cn(
											'h-24 w-12 min-w-0 max-w-[3rem] border-r-2 border-border p-0',
											isToday ? TODAY_BG : 'bg-background'
										)}
									/>
								)
							}
							const columns = [
								t('noten.anwesenheit'),
								t('noten.wiederholung'),
								t('noten.bericht'),
								t('noten.mitarbeit'),
								t('noten.praktischeArbeit'),
								t('noten.notizen')
							]
							return (
								<Fragment key={key}>
									{columns.map((label, index) => {
										const isLast = index === columns.length - 1
										// The attendance column keeps the plain background even on today.
										const highlight = isToday && index > 0
										return (
											<TableHead
												key={label}
												className={cn(
													VERTICAL_HEAD,
													isLast && 'border-r-2',
													highlight ? TODAY_BG : 'bg-background'
												)}
											>
												{label}
											</TableHead>
										)
									})}
								</Fragment>
							)
						})}
						{summaryHeadings.map((heading, index) => (
							<TableHead
								key={heading}
								className={cn(
									VERTICAL_HEAD,
									'bg-background',
									index === summaryHeadings.length - 1 && 'border-r-2'
								)}
							>
								{heading}
							</TableHead>
						))}
					</TableRow>
				</TableHeader>

				<TableBody>
					{students.map((student) => {
						const visible = rowGradeVisibility[student.id] ?? true
						const totals = summary[student.id]
						const final = finalGrades[student.id] ?? {
							first: { grade: null, conductNoteWish: null },
							second: { grade: null, conductNoteWish: null }
						}

						return (
							<TableRow
								key={student.id}
								ref={(el) => {
									studentRowRefs.current[student.id] = el
								}}
								className={
									highlightedStudentId === student.id
										? 'bg-yellow-100/60 dark:bg-yellow-900/20'
										: ''
								}
							>
								<TableCell className="sticky left-0 z-30 bg-background p-1 align-top">
									<div className="flex items-center justify-center pt-1">
										<Checkbox
											checked={visible}
											onCheckedChange={(checked) => onToggleRowVisible(student.id, checked === true)}
											aria-label={`Noten anzeigen für ${student.lastName} ${student.firstName}`}
										/>
									</div>
								</TableCell>
								<TableCell
									style={{ left: `${CHECKBOX_COLUMN_WIDTH_PX}px` }}
									className="sticky z-20 bg-background align-top"
								>
									<StudentPhoto
										studentId={student.id}
										firstName={student.firstName}
										lastName={student.lastName}
										nameFormat="lastFirst"
									/>
								</TableCell>
								<TableCell
									style={{ left: sitzplatzLeft }}
									className="z-18 sticky w-[3rem] min-w-[3rem] border-l border-r bg-background p-1 align-top"
								>
									<Input
										type="text"
										value={student.sitzplatz ?? ''}
										onChange={(e) => onSitzplatzChange(student.id, e.target.value || null)}
										placeholder={t('noten.sitzplatzPlaceholder', { defaultValue: 'Platz' })}
										className="h-7 w-full text-xs"
									/>
								</TableCell>

								{teachingDays.map((day) => {
									const key = `${day.date}-${day.period}`
									const isToday = day.date === focusDate
									if (collapsedDays.has(key)) {
										return (
											<TableCell
												key={key}
												className={cn(
													'w-12 min-w-0 max-w-[3rem] border-r-2 border-border p-0',
													isToday && TODAY_BG
												)}
											/>
										)
									}

									const entry =
										entries[entryKey(student.id, day.date, day.period)] ??
										emptyEntry(student.id, day.date, day.period)

									const attendanceBg =
										entry.attendance == null || entry.attendance === ''
											? ''
											: entry.attendance === 'Anwesend'
												? 'bg-green-100/50 dark:bg-green-900/20'
												: 'bg-red-100/50 dark:bg-red-900/20'

									const categories: Array<{
										first: keyof NotenEntryRow
										second: keyof NotenEntryRow
									}> = [
										{ first: 'wiederholung1', second: 'wiederholung2' },
										{ first: 'bericht1', second: 'bericht2' },
										{ first: 'mitarbeit1', second: 'mitarbeit2' },
										{ first: 'praktischeArbeit1', second: 'praktischeArbeit2' }
									]

									return (
										<Fragment key={key}>
											<TableCell
												className={cn('w-0 border-r border-border/70 p-1', attendanceBg)}
											>
												<Select
													value={entry.attendance ?? ''}
													onValueChange={(v) => onEntryChange(entry, { attendance: v })}
												>
													<SelectTrigger className="h-10 w-12 min-w-12 shrink-0 justify-center px-1.5">
														<SelectValue placeholder="-">
															{entry.attendance ? entry.attendance.charAt(0) : null}
														</SelectValue>
													</SelectTrigger>
													<SelectContent>
														{ATTENDANCE_OPTIONS.map((option) => (
															<SelectItem key={option} value={option}>
																{option}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</TableCell>

											{categories.map(({ first, second }) => (
												<TableCell
													key={first}
													className={cn(
														'border-r border-border/70 p-1',
														isToday && TODAY_BG
													)}
												>
													<CategoryGrades
														visible={visible}
														first={entry[first] as number | null}
														second={entry[second] as number | null}
														onChange={(slot, value) =>
															onEntryChange(entry, { [slot === 1 ? first : second]: value })
														}
													/>
												</TableCell>
											))}

											<TableCell
												className={cn(
													'w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] overflow-hidden border-r-2 border-border p-1 align-top',
													isToday && TODAY_BG
												)}
											>
												{visible ? (
													<TruncatedTextButton
														value={(entry.notizen ?? '').trim()}
														onClick={() => onOpenNotizen(student.id, day.date, day.period)}
													/>
												) : (
													<Hidden className="h-full min-h-[4.5rem] w-full py-1.5 text-sm" />
												)}
											</TableCell>
										</Fragment>
									)
								})}

								<TableCell className="w-8 min-w-[2rem] border-r border-border p-1 text-center">
									{totals?.nichtAnwesend ?? 0}
								</TableCell>
								<TableCell className="w-8 min-w-[2rem] border-r border-border p-1 text-center">
									{totals?.anwesend ?? 0}
								</TableCell>
								<TableCell className="w-8 min-w-[2rem] border-r border-border p-1 text-center">
									{totals?.alle ?? 0}
								</TableCell>
								<TableCell
									className={cn(
										'w-8 min-w-[2rem] border-r border-border p-1 text-center',
										totals != null &&
											(totals.pct < 50
												? 'font-medium text-red-600'
												: totals.pct < 75
													? 'font-medium text-amber-600'
													: '')
									)}
								>
									{totals != null ? `${totals.pct} %` : '–'}
								</TableCell>
								<TableCell className="w-8 min-w-[2rem] border-r border-border p-1 text-center">
									{visible ? (totals?.calculatedGrade ?? '–') : HIDDEN_PLACEHOLDER}
								</TableCell>
								<TableCell className="w-10 min-w-[2.5rem] border-r border-border p-1">
									{finalSelect(student.id, visible, 'first', 'grade', final.first.grade)}
								</TableCell>
								<TableCell className="w-10 min-w-[2.5rem] border-r border-border p-1">
									{finalSelect(
										student.id,
										visible,
										'first',
										'conductNoteWish',
										final.first.conductNoteWish
									)}
								</TableCell>
								<TableCell className="w-10 min-w-[2.5rem] border-r border-border p-1">
									{finalSelect(student.id, visible, 'second', 'grade', final.second.grade)}
								</TableCell>
								<TableCell className="w-10 min-w-[2.5rem] border-r-2 border-border p-1">
									{finalSelect(
										student.id,
										visible,
										'second',
										'conductNoteWish',
										final.second.conductNoteWish
									)}
								</TableCell>
							</TableRow>
						)
					})}

					<TableRow>
						<TableCell className="sticky left-0 z-10 w-[2.5rem] min-w-[2.5rem] border-r bg-background" />
						<TableCell
							style={{ left: `${CHECKBOX_COLUMN_WIDTH_PX}px` }}
							className="sticky z-10 border-r bg-background font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]"
						>
							{t('noten.lehrstoff')}
						</TableCell>
						<TableCell className="w-[3rem] min-w-[3rem] max-w-[3rem] border-r border-border bg-muted/20 p-1" />
						{teachingDays.map((day) => {
							const key = `${day.date}-${day.period}`
							const isToday = day.date === focusDate
							if (collapsedDays.has(key)) {
								return (
									<TableCell
										key={key}
										className={cn(
											'w-12 min-w-0 max-w-[3rem] border-r-2 border-border p-0',
											isToday && TODAY_BG
										)}
									/>
								)
							}
							return (
								<TableCell
									key={key}
									colSpan={6}
									className={cn(
										'w-[28rem] min-w-[28rem] max-w-[28rem] overflow-hidden border-r-2 border-border p-1',
										isToday && TODAY_BG
									)}
								>
									<TruncatedTextButton
										value={(lehrstoffByDay[key] ?? '').trim()}
										onClick={() => onOpenLehrstoff(day.date, day.period)}
									/>
								</TableCell>
							)
						})}
						<TableCell colSpan={9} className="border-r-2 border-border bg-muted/20 p-1" />
					</TableRow>
				</TableBody>
			</table>
		</div>
	)
}
