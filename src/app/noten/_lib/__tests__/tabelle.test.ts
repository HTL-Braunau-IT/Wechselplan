import { describe, expect, it } from 'vitest'
import { emptyEntry, type TeachingDay } from '../types'
import {
  buildColumns,
  defaultSemester,
  filterDays,
  halfStep,
  isCellEditable,
  nextCell,
  spansBy,
  stepCell,
  turnLabel,
} from '../tabelle'

const days: TeachingDay[] = [
  { date: '2026-09-15', period: 'AM', turn: 'TURNUS 1' },
  { date: '2026-09-15', period: 'PM', turn: 'TURNUS 1' },
  { date: '2026-09-22', period: 'AM', turn: 'TURNUS 1' },
  { date: '2027-02-16', period: 'AM', turn: 'TURNUS 4' },
]
const students = [1, 2, 3]
const all = () => true

describe('filterDays', () => {
  it('splits at the semester change date', () => {
    expect(filterDays(days, 'first', '2027-02-08')).toHaveLength(3)
    expect(filterDays(days, 'second', '2027-02-08')).toEqual([days[3]])
    expect(filterDays(days, 'all', '2027-02-08')).toHaveLength(4)
  })
})

describe('defaultSemester', () => {
  it('opens on the semester of the latest half-day already taught', () => {
    expect(defaultSemester(days, '2026-10-13', '2027-02-08')).toBe('first')
    expect(defaultSemester(days, '2027-03-01', '2027-02-08')).toBe('second')
    // A past school year viewed today: its last lesson decides, not today.
    expect(defaultSemester(days.slice(0, 3), '2028-01-01', '2026-09-20')).toBe('second')
    expect(defaultSemester(days.slice(0, 3), '2028-01-01', '2027-02-08')).toBe('first')
    // Nothing taught yet: the first half-day decides.
    expect(defaultSemester(days, '2026-01-01', '2027-02-08')).toBe('first')
  })
})

describe('buildColumns', () => {
  it('adds a 2. Note column per half-day and marks where each date starts', () => {
    const cols = buildColumns(days.slice(0, 2), true)
    expect(cols.map(c => [c.day.period, c.slot, c.startsDate])).toEqual([
      ['AM', 1, true],
      ['AM', 2, false],
      ['PM', 1, false],
      ['PM', 2, false],
    ])
    expect(buildColumns(days.slice(0, 2), false)).toHaveLength(2)
  })
})

describe('spansBy / turnLabel', () => {
  it('groups consecutive half-days', () => {
    const spans = spansBy(days, d => d.turn ?? '')
    expect(spans.map(s => [s.key, s.days.length])).toEqual([
      ['TURNUS 1', 3],
      ['TURNUS 4', 1],
    ])
    expect(turnLabel('TURNUS 4')).toBe('Turnus 4')
    expect(turnLabel('Block A')).toBe('Block A')
  })
})

describe('isCellEditable', () => {
  const day = days[0]!
  it('blocks future half-days and recorded absences, not missing attendance', () => {
    expect(isCellEditable(undefined, day, '2026-10-13')).toBe(true)
    expect(isCellEditable(undefined, day, '2026-09-01')).toBe(false)
    const krank = { ...emptyEntry(1, day.date, day.period), attendance: 'Krank' }
    expect(isCellEditable(krank, day, '2026-10-13')).toBe(false)
    const da = { ...emptyEntry(1, day.date, day.period), attendance: 'Anwesend' }
    expect(isCellEditable(da, day, '2026-10-13')).toBe(true)
  })
})

describe('nextCell', () => {
  const start = { studentId: 1, date: '2026-09-15', period: 'AM', slot: 2 as const }

  it('walks down the students, then on to the next half-day, keeping the slot', () => {
    expect(nextCell(start, students, days, 'down', all)).toEqual({ ...start, studentId: 2 })
    expect(nextCell({ ...start, studentId: 3 }, students, days, 'down', all)).toEqual({
      studentId: 1,
      date: '2026-09-15',
      period: 'PM',
      slot: 2,
    })
  })

  it('walks right through the half-days, then on to the next student', () => {
    expect(nextCell(start, students, days, 'right', all)).toEqual({ ...start, period: 'PM' })
    const last = { ...start, date: '2027-02-16' }
    expect(nextCell(last, students, days, 'right', all)).toEqual({ ...start, studentId: 2 })
  })

  it('skips cells that cannot take a mark and stops at the end', () => {
    const away = (id: number) => id !== 2
    expect(nextCell(start, students, days, 'down', away)).toEqual({ ...start, studentId: 3 })
    const end = { studentId: 3, date: '2027-02-16', period: 'AM', slot: 1 as const }
    expect(nextCell(end, students, days, 'down', all)).toBeNull()
  })
})

describe('stepCell', () => {
  const cols = buildColumns(days, true)
  const at = { studentId: 1, date: '2026-09-15', period: 'AM', slot: 1 as const }

  it('moves through both Notenplätze and stays put at the edge', () => {
    expect(stepCell(at, students, cols, 0, 1, all)).toEqual({ ...at, slot: 2 })
    expect(stepCell(at, students, cols, 0, -1, all)).toEqual(at)
    expect(stepCell(at, students, cols, -1, 0, all)).toEqual(at)
  })

  it('passes over cells that cannot take a mark', () => {
    expect(stepCell(at, students, cols, 1, 0, id => id !== 2)).toEqual({ ...at, studentId: 3 })
  })
})

describe('halfStep', () => {
  it('turns a whole mark into the half below it', () => {
    expect(halfStep(2)).toBe(2.5)
    expect(halfStep(4)).toBe(4.5)
    expect(halfStep(5)).toBeNull()
    expect(halfStep(2.5)).toBeNull()
    expect(halfStep(null)).toBeNull()
  })
})
