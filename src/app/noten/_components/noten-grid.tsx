'use client'

import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StudentPhoto } from '@/components/student-photo'
import { cn } from '@/lib/utils'
import {
  ALLOWED_FINAL_GRADES,
  ATTENDANCE_OPTIONS,
  CONDUCT_NOTE_WISH_OPTIONS,
  GESTUNDEN,
  GRADE_CLEAR_VALUE,
  GRADE_OPTIONS,
  NICHT_BEURTEILT,
  entryKey,
  getGradeBoxClass,
  isSemester2,
} from '@/lib/grades'
import {
  emptyEntry,
  type FinalGradePerStudent,
  type NotenEntryRow,
  type Student,
  type TeachingDay,
} from '../_lib/types'
import type { StudentSummary } from '../_lib/summary'

const HIDDEN_PLACEHOLDER = '•••'

/** Header row heights, in the order they stack. The second row pins below the first. */
const DAY_ROW_H = 'h-9'
const DAY_ROW_OFFSET = 'top-9'

/**
 * Pinned cells must be opaque or the columns scrolling underneath show through
 * them, and `border-collapse` drops borders on sticky cells entirely — hence
 * `border-separate` on the table and a shadow, not a border, for the divider
 * that marks where the frozen columns end.
 */
const PINNED_DIVIDER = 'shadow-[1px_0_0_0_var(--color-border)]'
const HEAD_CLASS = 'bg-muted border-border sticky z-20 border-b px-1 text-[11px] font-medium'
const PINNED_HEAD_CLASS = cn(HEAD_CLASS, 'z-30')
const CELL_BORDER = 'border-border/60 border-r border-b'
/** The day boundary, and the boundary before the summary block. */
const BLOCK_BORDER = 'border-border border-r-2 border-b'
const TODAY_BG = 'bg-accent'

/** Stand-in shown when a row's grades are hidden. */
function Hidden({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'border-input bg-muted/40 flex items-center justify-center rounded-md border px-2 text-xs select-none',
        className,
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
  onChange,
}: {
  visible: boolean
  first: number | null
  second: number | null
  onChange: (slot: 1 | 2, value: number | null) => void
}) {
  if (!visible) {
    return (
      <div className="flex flex-col gap-1">
        <Hidden className="h-7 w-full" />
        <Hidden className="h-7 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {([1, 2] as const).map(slot => {
        const value = slot === 1 ? first : second
        return (
          <Select
            key={slot}
            value={value?.toString() ?? ''}
            onValueChange={v =>
              onChange(slot, v === GRADE_CLEAR_VALUE || v === '' ? null : parseFloat(v))
            }
          >
            <SelectTrigger className={cn('h-7 w-full px-2', getGradeBoxClass(value))}>
              <SelectValue placeholder="-" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>
              {GRADE_OPTIONS.map(grade => (
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
  className,
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
        'border-input text-foreground hover:bg-muted/50 focus:ring-ring block h-full w-full max-w-full overflow-hidden rounded-md border bg-transparent px-2 py-1.5 text-left text-sm shadow-xs focus:ring-2 focus:outline-none',
        className,
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
    value: number | string | null,
  ) => void
  onFinalGradeCommit: (studentId: number) => void
  onOpenNotizen: (studentId: number, date: string, period: string) => void
  onOpenLehrstoff: (date: string, period: string) => void
}

/**
 * The Noten grid: one column block per teaching day, plus per-student totals
 * and final grades. Days can be collapsed to a narrow spacer column.
 *
 * The column headings used to be set in `writing-mode: vertical-rl`, which cost
 * 96px of header on every screen and still had to be read sideways; they are
 * abbreviations with a `title` now. Native titles rather than tooltip
 * components on purpose — there is one per column *per teaching day*, and a
 * term's worth of mounted Radix tooltips is not free.
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
    onOpenLehrstoff,
  } = props

  const focusDate = focusDateYmd ?? todayYmd
  const firstTodayIndex = teachingDays.findIndex(day => day.date === todayYmd)

  const endGradeLabel = (grade: number) =>
    grade === NICHT_BEURTEILT
      ? t('noten.gradeNichtBeurteilt', { defaultValue: 'Nicht beurteilt' })
      : grade === GESTUNDEN
        ? t('noten.gradeGestundet', { defaultValue: 'Gestundet' })
        : String(grade)

  /** Per-day columns: a short head, the full name kept for the tooltip. */
  const dayColumns: Array<{ short: string; full: string; width: string }> = [
    {
      short: t('noten.anwesenheitShort', { defaultValue: 'Anw.' }),
      full: t('noten.anwesenheit'),
      width: 'w-14 min-w-14',
    },
    {
      short: t('noten.wiederholungShort', { defaultValue: 'Wdh.' }),
      full: t('noten.wiederholung'),
      width: 'w-16 min-w-16',
    },
    {
      short: t('noten.berichtShort', { defaultValue: 'Ber.' }),
      full: t('noten.bericht'),
      width: 'w-16 min-w-16',
    },
    {
      short: t('noten.mitarbeitShort', { defaultValue: 'Mit.' }),
      full: t('noten.mitarbeit'),
      width: 'w-16 min-w-16',
    },
    {
      short: t('noten.praktischeArbeitShort', { defaultValue: 'Prakt.' }),
      full: t('noten.praktischeArbeit'),
      width: 'w-16 min-w-16',
    },
    {
      short: t('noten.notizenShort', { defaultValue: 'Notiz' }),
      full: t('noten.notizen'),
      width: 'w-20 min-w-20',
    },
  ]

  const summaryColumns: Array<{ short: string; full: string }> = [
    {
      short: t('noten.nichtAnwesendShort', { defaultValue: 'Fehlt' }),
      full: t('noten.nichtAnwesendTage', { defaultValue: 'Nicht anwesend' }),
    },
    {
      short: t('noten.anwesendShort', { defaultValue: 'Anw.' }),
      full: t('noten.anwesendTage', { defaultValue: 'Anwesend' }),
    },
    {
      short: t('noten.alleTageShort', { defaultValue: 'Tage' }),
      full: t('noten.alleTage', { defaultValue: 'Alle Tage' }),
    },
    {
      short: '%',
      full: t('noten.anwesenheitProzent', { defaultValue: 'Anw. %' }),
    },
    {
      short: t('noten.gradeBerechnetShort', { defaultValue: 'Note' }),
      full: t('noten.gradeBerechnetLong', { defaultValue: 'Berechnete Note' }),
    },
    {
      short: t('noten.endnoteShort1', { defaultValue: 'End 1' }),
      full: t('noten.endnoteSem1', { defaultValue: 'Endnote 1. Semester' }),
    },
    {
      short: t('noten.betragenShort1', { defaultValue: 'Betr 1' }),
      full: t('noten.betragenSem1', { defaultValue: 'Betragen 1. Semester' }),
    },
    {
      short: t('noten.endnoteShort2', { defaultValue: 'End 2' }),
      full: t('noten.endnoteSem2', { defaultValue: 'Endnote 2. Semester' }),
    },
    {
      short: t('noten.betragenShort2', { defaultValue: 'Betr 2' }),
      full: t('noten.betragenSem2', { defaultValue: 'Betragen 2. Semester' }),
    },
  ]

  /** A final-grade or Betragensnote select, or its hidden stand-in. */
  const finalSelect = (
    studentId: number,
    visible: boolean,
    semester: 'first' | 'second',
    field: 'grade' | 'conductNoteWish',
    value: number | string | null,
  ) => {
    if (!visible) return <Hidden className="h-8 w-full min-w-0" />
    const isGrade = field === 'grade'
    return (
      <Select
        value={value != null ? String(value) : ''}
        onValueChange={v =>
          onFinalGradeChange(
            studentId,
            semester,
            field,
            isGrade ? (v === GRADE_CLEAR_VALUE || v === '' ? null : parseFloat(v)) : v || null,
          )
        }
        onOpenChange={open => {
          if (!open) onFinalGradeCommit(studentId)
        }}
      >
        <SelectTrigger className="h-8 w-full min-w-0 px-2">
          <SelectValue placeholder="–" />
        </SelectTrigger>
        <SelectContent>
          {isGrade && <SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>}
          {isGrade
            ? ALLOWED_FINAL_GRADES.map(grade => (
                <SelectItem key={grade} value={String(grade)}>
                  {endGradeLabel(grade)}
                </SelectItem>
              ))
            : CONDUCT_NOTE_WISH_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <div className="relative max-h-[70vh] w-full overflow-auto rounded-md border">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              ref={nameColumnRef}
              style={{ left: 0 }}
              className={cn(
                PINNED_HEAD_CLASS,
                DAY_ROW_H,
                'top-0 left-0 min-w-[200px] px-2 text-left',
              )}
            >
              {t('noten.name')}
            </th>
            <th
              style={{ left: sitzplatzLeft }}
              className={cn(PINNED_HEAD_CLASS, DAY_ROW_H, 'top-0 w-14 min-w-14', PINNED_DIVIDER)}
            />
            {teachingDays.map((day, dayIndex) => {
              const key = `${day.date}-${day.period}`
              const isCollapsed = collapsedDays.has(key)
              const isToday = day.date === focusDate
              const previous = teachingDays[dayIndex - 1]
              // Only where it changes: repeating "1. Sem." on every column was
              // noise on a term with forty of them.
              const startsSemester =
                dayIndex === 0 ||
                (previous != null &&
                  isSemester2(previous.date, semesterChangeDate) !==
                    isSemester2(day.date, semesterChangeDate))
              const semesterLabel = isSemester2(day.date, semesterChangeDate)
                ? t('noten.semester2', { defaultValue: '2. Sem.' })
                : t('noten.semester1', { defaultValue: '1. Sem.' })
              const dayLabel = `${t('noten.tag')} ${dayIndex + 1} · ${day.date.split('-').reverse().join('.')}`

              return (
                <th
                  key={key}
                  ref={registerDayColumn(key, dayIndex === firstTodayIndex)}
                  colSpan={isCollapsed ? 1 : dayColumns.length}
                  className={cn(
                    HEAD_CLASS,
                    DAY_ROW_H,
                    'top-0 text-left',
                    isCollapsed ? 'w-9 min-w-9 px-0' : 'px-1',
                    startsSemester && 'border-primary/40 border-l-2',
                    isToday && TODAY_BG,
                  )}
                >
                  {isCollapsed ? (
                    <button
                      type="button"
                      title={`${dayLabel} — ${t('noten.expandDay', { defaultValue: 'Tag aufklappen' })}`}
                      aria-label={`${dayLabel} — ${t('noten.expandDay', { defaultValue: 'Tag aufklappen' })}`}
                      onClick={() => onToggleDay(day.date, day.period)}
                      className="hover:bg-muted-foreground/10 flex h-full w-full items-center justify-center"
                    >
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        title={t('noten.collapseDay', { defaultValue: 'Tag zuklappen' })}
                        aria-label={`${dayLabel} — ${t('noten.collapseDay', { defaultValue: 'Tag zuklappen' })}`}
                        onClick={() => onToggleDay(day.date, day.period)}
                        className="hover:bg-muted-foreground/10 rounded p-0.5"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <span className="text-xs font-semibold">
                        {t('noten.tag')} {dayIndex + 1}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {day.date.split('-').reverse().join('.')}
                      </span>
                      {startsSemester && (
                        <span className="text-primary text-[10px] font-semibold">
                          {semesterLabel}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-6 px-2 text-[11px] font-normal"
                        onClick={() => onSetAllAnwesend(day.date, day.period)}
                        disabled={saving}
                      >
                        {t('noten.allPresent', { defaultValue: 'Alle anwesend' })}
                      </Button>
                    </div>
                  )}
                </th>
              )
            })}
            <th
              colSpan={summaryColumns.length}
              className={cn(HEAD_CLASS, DAY_ROW_H, 'border-border top-0 border-l-2 px-2 text-left')}
            >
              {t('noten.zusammenfassung', { defaultValue: 'Zusammenfassung' })}
            </th>
          </tr>

          <tr>
            <th className={cn(PINNED_HEAD_CLASS, DAY_ROW_OFFSET, 'left-0 h-8 min-w-[200px]')} />
            <th
              style={{ left: sitzplatzLeft }}
              className={cn(PINNED_HEAD_CLASS, DAY_ROW_OFFSET, 'h-8 w-14 min-w-14', PINNED_DIVIDER)}
              title={t('noten.sitzplatz', { defaultValue: 'Sitzplatz' })}
            >
              {t('noten.sitzplatzShort', { defaultValue: 'Platz' })}
            </th>
            {teachingDays.map(day => {
              const key = `${day.date}-${day.period}`
              const isToday = day.date === focusDate
              if (collapsedDays.has(key)) {
                return (
                  <th
                    key={key}
                    className={cn(
                      HEAD_CLASS,
                      DAY_ROW_OFFSET,
                      'h-8 w-9 min-w-9',
                      isToday && TODAY_BG,
                    )}
                  />
                )
              }
              return (
                <Fragment key={key}>
                  {dayColumns.map((column, index) => (
                    <th
                      key={column.short}
                      title={column.full}
                      className={cn(
                        HEAD_CLASS,
                        DAY_ROW_OFFSET,
                        'h-8 text-center',
                        column.width,
                        index === dayColumns.length - 1 ? 'border-border border-r-2' : 'border-r',
                        isToday && TODAY_BG,
                      )}
                    >
                      {column.short}
                    </th>
                  ))}
                </Fragment>
              )
            })}
            {summaryColumns.map((column, index) => (
              <th
                key={column.short}
                title={column.full}
                className={cn(
                  HEAD_CLASS,
                  DAY_ROW_OFFSET,
                  'h-8 w-14 min-w-14 border-r text-center',
                  index === summaryColumns.length - 1 && 'border-border border-r-2',
                )}
              >
                {column.short}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {students.map(student => {
            const visible = rowGradeVisibility[student.id] ?? true
            const totals = summary[student.id]
            const final = finalGrades[student.id] ?? {
              first: { grade: null, conductNoteWish: null },
              second: { grade: null, conductNoteWish: null },
            }
            const highlighted = highlightedStudentId === student.id
            // The pinned cells are opaque, so a row background set on the <tr>
            // never reaches them — they carry their own.
            const rowBg = highlighted ? 'bg-warning/15' : 'bg-card group-hover:bg-muted'

            return (
              <tr
                key={student.id}
                ref={el => {
                  studentRowRefs.current[student.id] = el
                }}
                className={cn('group', highlighted && 'bg-warning/15')}
              >
                <td
                  style={{ left: 0 }}
                  className={cn(
                    'sticky left-0 z-10 min-w-[200px] p-1 align-top',
                    CELL_BORDER,
                    rowBg,
                  )}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onToggleRowVisible(student.id, !visible)}
                      title={
                        visible
                          ? t('noten.hideRowGrades', {
                              defaultValue: 'Noten dieser Zeile ausblenden',
                            })
                          : t('noten.showRowGrades', {
                              defaultValue: 'Noten dieser Zeile einblenden',
                            })
                      }
                      aria-label={`${
                        visible
                          ? t('noten.hideRowGrades', {
                              defaultValue: 'Noten dieser Zeile ausblenden',
                            })
                          : t('noten.showRowGrades', {
                              defaultValue: 'Noten dieser Zeile einblenden',
                            })
                      }: ${student.lastName} ${student.firstName}`}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 shrink-0 rounded p-1"
                    >
                      {visible ? (
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                    <StudentPhoto
                      studentId={student.id}
                      firstName={student.firstName}
                      lastName={student.lastName}
                      nameFormat="lastFirst"
                    />
                  </div>
                </td>
                <td
                  style={{ left: sitzplatzLeft }}
                  className={cn(
                    'sticky z-10 w-14 min-w-14 p-1 align-top',
                    CELL_BORDER,
                    PINNED_DIVIDER,
                    rowBg,
                  )}
                >
                  <Input
                    type="text"
                    value={student.sitzplatz ?? ''}
                    onChange={e => onSitzplatzChange(student.id, e.target.value || null)}
                    placeholder={t('noten.sitzplatzPlaceholder', { defaultValue: 'Platz' })}
                    aria-label={`${t('noten.sitzplatz', { defaultValue: 'Sitzplatz' })}: ${student.lastName} ${student.firstName}`}
                    className="h-7 w-full px-1 text-center text-xs"
                  />
                </td>

                {teachingDays.map(day => {
                  const key = `${day.date}-${day.period}`
                  const isToday = day.date === focusDate
                  if (collapsedDays.has(key)) {
                    return (
                      <td
                        key={key}
                        className={cn('w-9 min-w-9 p-0', BLOCK_BORDER, isToday && TODAY_BG)}
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
                        ? 'bg-success/10'
                        : 'bg-destructive/10'

                  const categories: Array<{
                    first: keyof NotenEntryRow
                    second: keyof NotenEntryRow
                  }> = [
                    { first: 'wiederholung1', second: 'wiederholung2' },
                    { first: 'bericht1', second: 'bericht2' },
                    { first: 'mitarbeit1', second: 'mitarbeit2' },
                    { first: 'praktischeArbeit1', second: 'praktischeArbeit2' },
                  ]

                  return (
                    <Fragment key={key}>
                      <td
                        className={cn(
                          'w-14 min-w-14 p-1 align-top',
                          CELL_BORDER,
                          // The recorded-attendance tint wins over the focus-day
                          // wash; without the fallback the today column had a
                          // gap wherever attendance was still blank.
                          isToday && TODAY_BG,
                          attendanceBg,
                        )}
                      >
                        <Select
                          value={entry.attendance ?? ''}
                          onValueChange={v => onEntryChange(entry, { attendance: v })}
                        >
                          <SelectTrigger
                            className="h-7 w-full justify-center px-1"
                            aria-label={`${t('noten.anwesenheit')}: ${student.lastName} ${student.firstName}`}
                          >
                            <SelectValue placeholder="-">
                              {entry.attendance ? entry.attendance.charAt(0) : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {ATTENDANCE_OPTIONS.map(option => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {categories.map(({ first, second }) => (
                        <td
                          key={first}
                          className={cn(
                            'w-16 min-w-16 p-1 align-top',
                            CELL_BORDER,
                            isToday && TODAY_BG,
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
                        </td>
                      ))}

                      <td
                        className={cn(
                          'w-20 max-w-20 min-w-20 overflow-hidden p-1 align-top',
                          BLOCK_BORDER,
                          isToday && TODAY_BG,
                        )}
                      >
                        {visible ? (
                          <TruncatedTextButton
                            value={(entry.notizen ?? '').trim()}
                            onClick={() => onOpenNotizen(student.id, day.date, day.period)}
                            className="min-h-[3.75rem]"
                          />
                        ) : (
                          <Hidden className="min-h-[3.75rem] w-full py-1.5 text-sm" />
                        )}
                      </td>
                    </Fragment>
                  )
                })}

                <td className="border-border w-14 min-w-14 border-r border-b border-l-2 p-1 text-center">
                  {totals?.nichtAnwesend ?? 0}
                </td>
                <td className={cn('w-14 min-w-14 p-1 text-center', CELL_BORDER)}>
                  {totals?.anwesend ?? 0}
                </td>
                <td className={cn('w-14 min-w-14 p-1 text-center', CELL_BORDER)}>
                  {totals?.alle ?? 0}
                </td>
                <td
                  className={cn(
                    'w-14 min-w-14 p-1 text-center',
                    CELL_BORDER,
                    totals != null &&
                      (totals.pct < 50
                        ? 'text-destructive font-medium'
                        : totals.pct < 75
                          ? 'text-warning-foreground font-medium'
                          : ''),
                  )}
                >
                  {totals != null ? `${totals.pct} %` : '–'}
                </td>
                <td className={cn('w-14 min-w-14 p-1 text-center', CELL_BORDER)}>
                  {visible ? (totals?.calculatedGrade ?? '–') : HIDDEN_PLACEHOLDER}
                </td>
                <td className={cn('w-14 min-w-14 p-1', CELL_BORDER)}>
                  {finalSelect(student.id, visible, 'first', 'grade', final.first.grade)}
                </td>
                <td className={cn('w-14 min-w-14 p-1', CELL_BORDER)}>
                  {finalSelect(
                    student.id,
                    visible,
                    'first',
                    'conductNoteWish',
                    final.first.conductNoteWish,
                  )}
                </td>
                <td className={cn('w-14 min-w-14 p-1', CELL_BORDER)}>
                  {finalSelect(student.id, visible, 'second', 'grade', final.second.grade)}
                </td>
                <td className={cn('w-14 min-w-14 p-1', BLOCK_BORDER)}>
                  {finalSelect(
                    student.id,
                    visible,
                    'second',
                    'conductNoteWish',
                    final.second.conductNoteWish,
                  )}
                </td>
              </tr>
            )
          })}

          <tr className="group">
            <td
              style={{ left: 0 }}
              className={cn(
                'bg-card group-hover:bg-muted sticky left-0 z-10 px-2 text-sm font-medium',
                CELL_BORDER,
              )}
            >
              {t('noten.lehrstoff')}
            </td>
            <td
              style={{ left: sitzplatzLeft }}
              className={cn(
                'bg-card group-hover:bg-muted sticky z-10 w-14 min-w-14 p-1',
                CELL_BORDER,
                PINNED_DIVIDER,
              )}
            />
            {teachingDays.map(day => {
              const key = `${day.date}-${day.period}`
              const isToday = day.date === focusDate
              if (collapsedDays.has(key)) {
                return (
                  <td
                    key={key}
                    className={cn('w-9 min-w-9 p-0', BLOCK_BORDER, isToday && TODAY_BG)}
                  />
                )
              }
              return (
                <td
                  key={key}
                  colSpan={dayColumns.length}
                  className={cn('overflow-hidden p-1', BLOCK_BORDER, isToday && TODAY_BG)}
                >
                  <TruncatedTextButton
                    value={(lehrstoffByDay[key] ?? '').trim()}
                    onClick={() => onOpenLehrstoff(day.date, day.period)}
                    className="min-h-9"
                  />
                </td>
              )
            })}
            <td
              colSpan={summaryColumns.length}
              className="border-border border-r-2 border-b border-l-2 p-1"
            />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
