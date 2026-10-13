'use client'

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Keyboard } from 'lucide-react'
import { Hint } from '@/components/hint'
import { entryKey, getGradeBoxClass } from '@/lib/grades'
import { cn } from '@/lib/utils'
import {
  CATEGORIES,
  type CategoryKey,
  GRADE_STEPS,
  PERIOD_SHORT,
  categoryField,
  fmtGrade,
  roundHalf,
} from '../_lib/erfassen'
import {
  type AdvanceDirection,
  type SemesterFilter,
  type TableCell,
  buildColumns,
  defaultSemester,
  filterDays,
  halfStep,
  isCellEditable,
  nextCell,
  sameCell,
  spansBy,
  stepCell,
  turnLabel,
} from '../_lib/tabelle'
import type { NotenEntryRow, Student, TeachingDay } from '../_lib/types'

const NAME_W = 200
const AVG_W = 60
/** Header row heights in px — the sticky offsets are summed from these. */
const ROW_H = { turn: 24, date: 36, period: 24, slot: 20 }

const HEAD =
  'bg-muted border-border sticky z-[5] flex items-center justify-center border-b text-[11px] font-medium tabular-nums'

function shortDate(date: string): string {
  const [, m, d] = date.split('-')
  return `${d}.${m}.`
}

/** Weekday abbreviation for a local YYYY-MM-DD, e.g. "Di". */
function weekdayShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('de-AT', { weekday: 'short' })
    .format(new Date(y!, (m ?? 1) - 1, d ?? 1))
    .replace('.', '')
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string; title?: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="border-input bg-card inline-flex overflow-hidden rounded-md border shadow-xs"
      >
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'border-input h-8 border-r px-2.5 text-xs transition-colors last:border-r-0',
              value === option.value
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="border-border bg-muted text-foreground rounded-sm border border-b-2 px-1.5 font-mono text-[11px]">
      {children}
    </kbd>
  )
}

export type TabelleTabProps = {
  teachingDays: TeachingDay[]
  students: Student[]
  entries: Record<string, NotenEntryRow>
  hideGrades: boolean
  todayYmd: string
  semesterChangeDate: string | undefined
  /** Whether the 2. Note columns show — the teacher's saved preference. */
  showSecondMark: boolean
  onShowSecondMarkChange: (value: boolean) => void
  onToggleHide: () => void
  onMark: (
    studentId: number,
    date: string,
    period: string,
    field: keyof NotenEntryRow,
    value: number | null,
  ) => void
}

/**
 * Tabelle — every half-day of the term in one grid, for catching up on marks
 * (typically Berichte after they have been corrected). Students run down the
 * side, half-days across the top with a 1. and 2. Note each; a cell is picked
 * once and marks are then typed, the selection moving on by itself.
 */
export function TabelleTab({
  teachingDays,
  students,
  entries,
  hideGrades,
  todayYmd,
  semesterChangeDate,
  showSecondMark,
  onShowSecondMarkChange,
  onToggleHide,
  onMark,
}: TabelleTabProps) {
  const { t } = useTranslation('common')

  const [category, setCategory] = useState<CategoryKey>('bericht')
  const [semester, setSemester] = useState<SemesterFilter>(() =>
    defaultSemester(teachingDays, todayYmd, semesterChangeDate),
  )
  const [direction, setDirection] = useState<AdvanceDirection>('down')
  const [active, setActive] = useState<TableCell | null>(null)
  // The cell the last digit went into, so a following "," can halve it even
  // though the selection has already moved on.
  const lastWrittenRef = useRef<TableCell | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const days = useMemo(
    () => filterDays(teachingDays, semester, semesterChangeDate),
    [teachingDays, semester, semesterChangeDate],
  )
  const columns = useMemo(() => buildColumns(days, showSecondMark), [days, showSecondMark])
  const studentIds = useMemo(() => students.map(s => s.id), [students])
  const slotCount = showSecondMark ? 2 : 1
  const hasTurns = days.some(day => day.turn)

  const editable = useCallback(
    (studentId: number, day: TeachingDay) =>
      isCellEditable(entries[entryKey(studentId, day.date, day.period)], day, todayYmd),
    [entries, todayYmd],
  )

  const valueOf = useCallback(
    (cell: TableCell) => {
      const entry = entries[entryKey(cell.studentId, cell.date, cell.period)]
      return (entry?.[categoryField(category, cell.slot)] as number | null | undefined) ?? null
    },
    [entries, category],
  )

  const write = useCallback(
    (cell: TableCell, value: number | null) =>
      onMark(cell.studentId, cell.date, cell.period, categoryField(category, cell.slot), value),
    [onMark, category],
  )

  const advanceFrom = useCallback(
    (cell: TableCell) => nextCell(cell, studentIds, days, direction, editable) ?? cell,
    [studentIds, days, direction, editable],
  )

  const select = useCallback((cell: TableCell | null) => {
    lastWrittenRef.current = null
    setActive(cell)
  }, [])

  // A selection that the filters have hidden (2. Note off, other semester) is dropped.
  if (active) {
    const visible = columns.some(
      c => c.day.date === active.date && c.day.period === active.period && c.slot === active.slot,
    )
    if (!visible) setActive(null)
  }

  /** Enter a mark into the selected cell and move on. */
  const enter = useCallback(
    (value: number) => {
      if (!active) return
      write(active, value)
      lastWrittenRef.current = active
      setActive(advanceFrom(active))
    },
    [active, write, advanceFrom],
  )

  // Keyboard entry while a cell is selected. Re-subscribes as entries change so
  // the handler reads current values; a group is small enough for that to be free.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return
      }
      const key = e.key
      if (key >= '1' && key <= '5' && key.length === 1) {
        e.preventDefault()
        enter(Number(key))
        return
      }
      if (key === ',' || key === '.') {
        e.preventDefault()
        const last = lastWrittenRef.current
        const half = last ? halfStep(valueOf(last)) : null
        if (last && half != null) write(last, half)
        return
      }
      if (key === 'Backspace' || key === 'Delete') {
        e.preventDefault()
        lastWrittenRef.current = null
        write(active, null)
        return
      }
      if (key === 'Escape') {
        select(null)
        return
      }
      if (key === 'Enter') {
        e.preventDefault()
        select(advanceFrom(active))
        return
      }
      const move = {
        ArrowDown: [1, 0],
        ArrowUp: [-1, 0],
        ArrowRight: [0, 1],
        ArrowLeft: [0, -1],
      }[key]
      if (move) {
        e.preventDefault()
        select(stepCell(active, studentIds, columns, move[0]!, move[1]!, editable))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, enter, write, valueOf, select, advanceFrom, studentIds, columns, editable])

  // Keep the selected cell in view as typing walks it across the term.
  useEffect(() => {
    if (!active) return
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-cell="${active.studentId}|${active.date}|${active.period}|${active.slot}"]`,
    )
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active])

  /** First cell of a half-day still without a mark — where a header click lands. */
  const jumpTo = (day: TeachingDay) => {
    const slot = active && showSecondMark ? active.slot : 1
    for (const studentId of studentIds) {
      if (!editable(studentId, day)) continue
      const cell: TableCell = { studentId, date: day.date, period: day.period, slot }
      if (valueOf(cell) == null) {
        select(cell)
        return
      }
    }
  }

  const categoryLabel = t(CATEGORIES.find(c => c.key === category)!.fullKey)
  const cellW = showSecondMark ? 40 : 52
  // Cells stretch to fill the card when the term is short and keep their
  // minimum (scrolling sideways) when it is long.
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `${NAME_W}px repeat(${columns.length}, minmax(${cellW}px, 1fr)) ${AVG_W}px`,
    width: '100%',
    minWidth: 'max-content',
  }

  // Sticky offsets for the header rows that are present.
  const tops: number[] = []
  let offset = 0
  const rowsShown = [hasTurns, true, true, showSecondMark]
  const heights = [ROW_H.turn, ROW_H.date, ROW_H.period, ROW_H.slot]
  rowsShown.forEach((shown, i) => {
    tops[i] = offset
    if (shown) offset += heights[i]!
  })
  const headerHeight = offset

  const nameHead = (row: number, height: number, children?: ReactNode) => (
    <div className={cn(HEAD, 'left-0 z-[6] justify-start px-3')} style={{ top: tops[row], height }}>
      {children}
    </div>
  )
  const avgHead = (row: number, height: number, children?: ReactNode) => (
    <div className={cn(HEAD, 'border-l')} style={{ top: tops[row], height }}>
      {children}
    </div>
  )

  const activeStudent = active ? students.find(s => s.id === active.studentId) : null

  return (
    <div className="border-border bg-card overflow-hidden rounded-lg border shadow-sm">
      <div className="border-border flex flex-wrap items-center gap-x-5 gap-y-3 border-b px-5 py-3">
        <Segmented
          label={t('noten.tabelleCategory', { defaultValue: 'Kategorie' })}
          value={category}
          onChange={value => {
            lastWrittenRef.current = null
            setCategory(value)
          }}
          options={CATEGORIES.map(c => ({
            value: c.key,
            // Short labels throughout, so picking one does not shift the others.
            label: t(c.shortKey),
            title: t(c.fullKey),
          }))}
        />
        <Segmented
          label={t('noten.tabellePeriod', { defaultValue: 'Zeitraum' })}
          value={semester}
          onChange={value => {
            select(null)
            setSemester(value)
          }}
          options={[
            { value: 'first', label: t('noten.semester1', { defaultValue: '1. Sem.' }) },
            { value: 'second', label: t('noten.semester2', { defaultValue: '2. Sem.' }) },
            { value: 'all', label: t('noten.tabelleWholeYear', { defaultValue: 'Schuljahr' }) },
          ]}
        />
        <Segmented
          label={t('noten.tabelleAdvance', { defaultValue: 'Weiter' })}
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'down', label: t('noten.tabelleAdvanceDown', { defaultValue: '↓ Schüler' }) },
            {
              value: 'right',
              label: t('noten.tabelleAdvanceRight', { defaultValue: '→ Halbtag' }),
            },
          ]}
        />
        <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showSecondMark}
            onChange={e => onShowSecondMarkChange(e.target.checked)}
            className="accent-primary h-3.5 w-3.5"
          />
          {t('noten.tabelleSecondMark', { defaultValue: '2. Note' })}
        </label>
        <Hint
          label={t('noten.tooltipToggleGrades', {
            defaultValue:
              'Blendet die Noten nur auf diesem Bildschirm aus — für die Besprechung vor der Klasse. Gespeichert bleibt alles.',
          })}
        >
          <button
            type="button"
            onClick={onToggleHide}
            className={cn(
              'ml-auto flex h-8 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium shadow-xs transition-colors',
              hideGrades
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-input bg-background text-foreground hover:bg-accent',
            )}
          >
            {hideGrades ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {t('noten.hideAllGrades', { defaultValue: 'Noten ausblenden' })}
          </button>
        </Hint>
      </div>

      <div className="border-border/60 text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-5 py-2 text-xs">
        <Keyboard className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="flex items-center gap-1">
          <Key>1</Key>–<Key>5</Key>{' '}
          {t('noten.tabelleKeyDigit', { defaultValue: 'Note, springt weiter' })}
        </span>
        <span className="flex items-center gap-1">
          <Key>,</Key>{' '}
          {t('noten.tabelleKeyHalf', { defaultValue: 'direkt danach: halbe Note (2 , → 2,5)' })}
        </span>
        <span className="flex items-center gap-1">
          <Key>←</Key>
          <Key>↑</Key>
          <Key>→</Key>
          <Key>↓</Key> {t('noten.tabelleKeyMove', { defaultValue: 'bewegen' })}
        </span>
        <span className="flex items-center gap-1">
          <Key>⌫</Key> {t('noten.tabelleKeyClear', { defaultValue: 'löschen' })}
        </span>
        <span className="flex items-center gap-1">
          <Key>Esc</Key> {t('noten.tabelleKeyEscape', { defaultValue: 'abwählen' })}
        </span>
      </div>

      {days.length === 0 ? (
        <p className="text-muted-foreground px-5 py-10 text-center text-sm">
          {t('noten.tabelleNoDays', {
            defaultValue: 'In diesem Zeitraum hat die Gruppe keine Unterrichtstage.',
          })}
        </p>
      ) : (
        <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
          <div className="grid text-sm" style={gridStyle}>
            {hasTurns && (
              <>
                {nameHead(0, ROW_H.turn)}
                {spansBy(days, day => day.turn ?? '').map((span, i) => (
                  <div
                    key={`${span.key}-${i}`}
                    className={cn(
                      HEAD,
                      'text-muted-foreground border-l text-[10.5px] tracking-wide uppercase',
                    )}
                    style={{
                      top: tops[0],
                      height: ROW_H.turn,
                      gridColumn: `span ${span.days.length * slotCount}`,
                    }}
                  >
                    {span.key ? turnLabel(span.key) : ''}
                  </div>
                ))}
                {avgHead(0, ROW_H.turn)}
              </>
            )}

            {nameHead(1, ROW_H.date, t('noten.name'))}
            {spansBy(days, day => day.date).map(span => {
              const isToday = span.key === todayYmd
              const future = span.key > todayYmd
              return (
                <button
                  key={span.key}
                  type="button"
                  disabled={future}
                  onClick={() => jumpTo(span.days[0]!)}
                  title={t('noten.tabelleJumpHint', {
                    defaultValue: 'Erste leere Zelle anspringen',
                  })}
                  className={cn(
                    HEAD,
                    'hover:bg-accent disabled:hover:bg-muted flex-col gap-0 border-l disabled:cursor-default',
                    isToday && 'text-primary shadow-[inset_0_2px_0_0_var(--color-primary)]',
                    future && 'text-muted-foreground',
                  )}
                  style={{
                    top: tops[1],
                    height: ROW_H.date,
                    gridColumn: `span ${span.days.length * slotCount}`,
                  }}
                >
                  <span className="text-xs leading-tight font-semibold">{shortDate(span.key)}</span>
                  <span className="text-muted-foreground text-[10px] leading-tight font-normal">
                    {isToday ? t('noten.heute', { defaultValue: 'heute' }) : weekdayShort(span.key)}
                  </span>
                </button>
              )
            })}
            {avgHead(1, ROW_H.date, `Ø ${t(CATEGORIES.find(c => c.key === category)!.shortKey)}`)}

            {nameHead(2, ROW_H.period)}
            {days.map((day, i) => {
              const future = day.date > todayYmd
              let done = 0
              let total = 0
              for (const studentId of studentIds) {
                if (!editable(studentId, day)) continue
                total++
                if (valueOf({ studentId, date: day.date, period: day.period, slot: 1 }) != null)
                  done++
              }
              const startsDate = i === 0 || days[i - 1]!.date !== day.date
              return (
                <button
                  key={`${day.date}-${day.period}`}
                  type="button"
                  disabled={future}
                  onClick={() => jumpTo(day)}
                  title={t('noten.tabelleJumpHint', {
                    defaultValue: 'Erste leere Zelle anspringen',
                  })}
                  className={cn(
                    HEAD,
                    'hover:bg-accent disabled:hover:bg-muted gap-1 text-[10.5px] disabled:cursor-default',
                    startsDate ? 'border-l' : 'border-border/60 border-l',
                    future && 'text-muted-foreground',
                  )}
                  style={{ top: tops[2], height: ROW_H.period, gridColumn: `span ${slotCount}` }}
                >
                  {PERIOD_SHORT[day.period] ?? day.period}
                  {!future && (
                    <span
                      className={cn(
                        'font-normal',
                        done === total ? 'text-success' : 'text-muted-foreground',
                      )}
                    >
                      {done}/{total}
                    </span>
                  )}
                </button>
              )
            })}
            {avgHead(2, ROW_H.period)}

            {showSecondMark && (
              <>
                {nameHead(3, ROW_H.slot)}
                {columns.map(col => (
                  <div
                    key={`${col.day.date}-${col.day.period}-${col.slot}`}
                    className={cn(
                      HEAD,
                      'text-muted-foreground text-[10px] font-normal',
                      col.startsDate ? 'border-l' : 'border-border/60 border-l',
                    )}
                    style={{ top: tops[3], height: ROW_H.slot }}
                  >
                    {col.slot}.
                  </div>
                ))}
                {avgHead(3, ROW_H.slot)}
              </>
            )}

            {students.map(student => {
              const marks: number[] = []
              for (const day of days) {
                for (const slot of [1, 2] as const) {
                  const v = valueOf({
                    studentId: student.id,
                    date: day.date,
                    period: day.period,
                    slot,
                  })
                  if (v != null) marks.push(v)
                }
              }
              const avg = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null
              const name = `${student.lastName}, ${student.firstName}`
              return (
                <div key={student.id} className="contents">
                  <div className="bg-card border-border/60 sticky left-0 z-[2] flex h-9 flex-col items-start justify-center overflow-hidden border-b px-3 leading-tight shadow-[1px_0_0_0_var(--color-border)]">
                    <span
                      className="w-full truncate"
                      title={`${student.lastName}, ${student.firstName}`}
                    >
                      {student.lastName}
                    </span>
                    <span className="text-muted-foreground w-full truncate text-xs">
                      {student.firstName}
                    </span>
                  </div>
                  {columns.map(col => {
                    const cell: TableCell = {
                      studentId: student.id,
                      date: col.day.date,
                      period: col.day.period,
                      slot: col.slot,
                    }
                    const entry = entries[entryKey(student.id, col.day.date, col.day.period)]
                    const attendance = entry?.attendance ?? null
                    const away = attendance != null && attendance !== 'Anwesend'
                    const future = col.day.date > todayYmd
                    const value = valueOf(cell)
                    const isActive = sameCell(active, cell)
                    const label = away
                      ? col.slot === 1
                        ? attendance.charAt(0)
                        : ''
                      : future
                        ? ''
                        : value == null
                          ? '·'
                          : hideGrades
                            ? '•'
                            : fmtGrade(value)
                    const desc = `${name} · ${shortDate(col.day.date)} ${PERIOD_SHORT[col.day.period] ?? col.day.period} · ${categoryLabel} ${col.slot}. ${t('noten.tabelleMark', { defaultValue: 'Note' })}${away ? ` · ${attendance}` : ''}`
                    return (
                      <button
                        key={`${col.day.date}-${col.day.period}-${col.slot}`}
                        type="button"
                        data-cell={`${student.id}|${col.day.date}|${col.day.period}|${col.slot}`}
                        disabled={away || future}
                        onClick={() => select(isActive ? null : cell)}
                        title={desc}
                        aria-label={desc}
                        aria-pressed={isActive}
                        style={{ scrollMarginLeft: NAME_W, scrollMarginTop: headerHeight }}
                        className={cn(
                          'border-border/60 flex h-9 items-center justify-center border-b text-xs font-medium tabular-nums outline-none',
                          col.startsDate ? 'border-border border-l' : 'border-l',
                          away &&
                            'bg-destructive/10 text-destructive cursor-not-allowed font-semibold',
                          future && 'bg-muted/40 cursor-not-allowed',
                          !away && !future && 'hover:bg-accent cursor-cell',
                          !away && !future && value == null && 'text-muted-foreground font-normal',
                          !away &&
                            value != null &&
                            !hideGrades &&
                            getGradeBoxClass(roundHalf(value)),
                          isActive && 'ring-primary bg-primary/10 relative z-[1] ring-2 ring-inset',
                        )}
                      >
                        {label}
                      </button>
                    )
                  })}
                  <div
                    className={cn(
                      'border-border/60 flex h-9 items-center justify-center border-b border-l font-semibold tabular-nums',
                      !hideGrades && avg != null && getGradeBoxClass(roundHalf(avg)),
                    )}
                  >
                    {hideGrades ? '•••' : fmtGrade(avg)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="border-border bg-muted/30 flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-5 py-2.5">
        <span className="min-w-[220px] text-xs">
          {active && activeStudent ? (
            <>
              <span className="font-semibold">
                {activeStudent.lastName} {activeStudent.firstName}
              </span>{' '}
              · {shortDate(active.date)} {PERIOD_SHORT[active.period] ?? active.period} ·{' '}
              {categoryLabel} {active.slot}. {t('noten.tabelleMark', { defaultValue: 'Note' })}
            </>
          ) : (
            <span className="text-muted-foreground">
              {t('noten.tabelleSelectHint', {
                defaultValue: 'Zelle anklicken oder Datum / VM / NM anklicken',
              })}
            </span>
          )}
        </span>
        <div className="flex flex-wrap gap-1">
          {[null, ...GRADE_STEPS].map(step => (
            <button
              key={step ?? 'clear'}
              type="button"
              disabled={!active}
              onClick={() => {
                if (!active) return
                if (step == null) {
                  lastWrittenRef.current = null
                  write(active, null)
                } else enter(step)
              }}
              className={cn(
                'border-input h-8 min-w-[36px] rounded-sm border px-1.5 text-sm tabular-nums transition-colors disabled:opacity-40',
                step == null ? 'bg-card' : getGradeBoxClass(step),
              )}
            >
              {step == null ? '–' : fmtGrade(step)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
