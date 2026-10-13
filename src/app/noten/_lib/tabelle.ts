import { isSemester2 } from '@/lib/grades'
import type { NotenEntryRow, TeachingDay } from './types'

/**
 * The Tabelle view: students down the side, half-days across the top, one
 * column per (half-day, Notenplatz). Everything here is pure so the keyboard
 * walk can be tested without rendering the grid.
 */

export type Slot = 1 | 2

/** One addressable cell: a student's mark in one Notenplatz of one half-day. */
export type TableCell = { studentId: number; date: string; period: string; slot: Slot }

export type TableColumn = {
  day: TeachingDay
  slot: Slot
  /** First column of a date — draws the heavier divider between dates. */
  startsDate: boolean
}

export type SemesterFilter = 'first' | 'second' | 'all'

export type AdvanceDirection = 'down' | 'right'

/** A run of consecutive half-days sharing a label (a Turnus or a date). */
export type DaySpan = { key: string; days: TeachingDay[] }

export function filterDays(
  days: TeachingDay[],
  semester: SemesterFilter,
  semesterChangeDate: string | undefined,
): TeachingDay[] {
  if (semester === 'all') return days
  const wantSecond = semester === 'second'
  return days.filter(day => isSemester2(day.date, semesterChangeDate) === wantSecond)
}

/**
 * The semester the table opens on: that of the latest half-day already taught,
 * so catching up lands on the term being marked. Picking today's semester left
 * the grid empty when browsing a past school year, or before the first lesson
 * of a new term.
 */
export function defaultSemester(
  days: TeachingDay[],
  todayYmd: string,
  semesterChangeDate: string | undefined,
): Exclude<SemesterFilter, 'all'> {
  const taught = days.filter(day => day.date <= todayYmd)
  const ref = taught[taught.length - 1]?.date ?? days[0]?.date ?? todayYmd
  return isSemester2(ref, semesterChangeDate) ? 'second' : 'first'
}

export function buildColumns(days: TeachingDay[], showSecond: boolean): TableColumn[] {
  const slots: Slot[] = showSecond ? [1, 2] : [1]
  const columns: TableColumn[] = []
  days.forEach((day, i) => {
    const startsDate = i === 0 || days[i - 1]!.date !== day.date
    slots.forEach((slot, s) => columns.push({ day, slot, startsDate: startsDate && s === 0 }))
  })
  return columns
}

/** Consecutive half-days grouped by `keyOf` — the spans of a header row. */
export function spansBy(days: TeachingDay[], keyOf: (day: TeachingDay) => string): DaySpan[] {
  const spans: DaySpan[] = []
  for (const day of days) {
    const key = keyOf(day)
    const last = spans[spans.length - 1]
    if (last?.key === key) last.days.push(day)
    else spans.push({ key, days: [day] })
  }
  return spans
}

/** "TURNUS 1" → "Turnus 1"; anything else is shown as stored. */
export function turnLabel(turn: string): string {
  const match = /^turnus\s+(\S+)$/i.exec(turn.trim())
  return match ? `Turnus ${match[1]}` : turn
}

/**
 * Whether a mark can be entered: not on a half-day still ahead, and not for a
 * student recorded as away. A missing attendance does not block — marks may be
 * entered before (or without) the attendance, which is left as it is.
 */
export function isCellEditable(
  entry: NotenEntryRow | undefined,
  day: TeachingDay,
  todayYmd: string,
): boolean {
  if (day.date > todayYmd) return false
  const attendance = entry?.attendance ?? null
  return attendance == null || attendance === 'Anwesend'
}

function sameDay(a: TeachingDay, b: { date: string; period: string }) {
  return a.date === b.date && a.period === b.period
}

/**
 * Where the selection goes after a mark is typed. It keeps the Notenplatz (a
 * run of 2. Noten stays in the 2. Noten) and skips cells that cannot take a
 * mark. Down walks the students of a half-day, then the next half-day; right
 * walks one student's half-days, then the next student. Null at the end.
 */
export function nextCell(
  current: TableCell,
  studentIds: number[],
  days: TeachingDay[],
  direction: AdvanceDirection,
  editable: (studentId: number, day: TeachingDay) => boolean,
): TableCell | null {
  let row = studentIds.indexOf(current.studentId)
  let col = days.findIndex(day => sameDay(day, current))
  if (row < 0 || col < 0) return null
  const total = studentIds.length * days.length
  for (let i = 0; i < total; i++) {
    if (direction === 'down') {
      row++
      if (row >= studentIds.length) {
        row = 0
        col++
      }
    } else {
      col++
      if (col >= days.length) {
        col = 0
        row++
      }
    }
    if (row >= studentIds.length || col >= days.length) return null
    const studentId = studentIds[row]!
    const day = days[col]!
    if (editable(studentId, day)) {
      return { studentId, date: day.date, period: day.period, slot: current.slot }
    }
  }
  return null
}

/**
 * Arrow-key move: one step through the visible columns (both Notenplätze) or
 * rows, passing over cells that cannot take a mark. Stays put at the edge.
 */
export function stepCell(
  current: TableCell,
  studentIds: number[],
  columns: TableColumn[],
  dRow: number,
  dCol: number,
  editable: (studentId: number, day: TeachingDay) => boolean,
): TableCell {
  let row = studentIds.indexOf(current.studentId)
  let col = columns.findIndex(c => sameDay(c.day, current) && c.slot === current.slot)
  if (row < 0 || col < 0) return current
  for (;;) {
    row += dRow
    col += dCol
    if (row < 0 || row >= studentIds.length || col < 0 || col >= columns.length) return current
    const column = columns[col]!
    const studentId = studentIds[row]!
    if (editable(studentId, column.day)) {
      return { studentId, date: column.day.date, period: column.day.period, slot: column.slot }
    }
  }
}

/** "," after a whole mark makes it the half below: 2 → 2,5. Null when it cannot. */
export function halfStep(value: number | null | undefined): number | null {
  if (value == null || !Number.isInteger(value) || value >= 5) return null
  return value + 0.5
}

export function sameCell(a: TableCell | null, b: TableCell | null): boolean {
  if (!a || !b) return false
  return (
    a.studentId === b.studentId && a.date === b.date && a.period === b.period && a.slot === b.slot
  )
}
