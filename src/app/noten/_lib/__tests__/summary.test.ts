import { describe, it, expect } from 'vitest'
import { entryKey } from '@/lib/grades'
import { computeStudentSummary } from '../summary'
import {
  DEFAULT_WEIGHTS,
  emptyEntry,
  type NotenEntryRow,
  type Student,
  type TeachingDay,
} from '../types'

const student: Student = { id: 1, firstName: 'Ada', lastName: 'Lovelace', groupId: 1 }

const days: TeachingDay[] = [
  { date: '2026-02-02', period: 'AM' },
  { date: '2026-02-09', period: 'AM' },
]

/** Index entries the way the page does, so the helper can find them. */
function index(rows: NotenEntryRow[]): Record<string, NotenEntryRow> {
  return Object.fromEntries(rows.map(row => [entryKey(row.studentId, row.date, row.period), row]))
}

function entry(date: string, patch: Partial<NotenEntryRow>): NotenEntryRow {
  return { ...emptyEntry(1, date, 'AM'), ...patch }
}

describe('computeStudentSummary', () => {
  it('counts a day with no entry as an absence', () => {
    const result = computeStudentSummary([student], days, {}, DEFAULT_WEIGHTS)

    expect(result[1]).toMatchObject({ anwesend: 0, nichtAnwesend: 2, alle: 2, pct: 0 })
  })

  it('counts only explicit "Anwesend" as present', () => {
    const entries = index([
      entry('2026-02-02', { attendance: 'Anwesend' }),
      entry('2026-02-09', { attendance: 'Krank' }),
    ])

    const result = computeStudentSummary([student], days, entries, DEFAULT_WEIGHTS)

    expect(result[1]).toMatchObject({ anwesend: 1, nichtAnwesend: 1, pct: 50 })
  })

  it('reports attendance percentage to one decimal', () => {
    const threeDays: TeachingDay[] = [
      { date: '2026-02-02', period: 'AM' },
      { date: '2026-02-09', period: 'AM' },
      { date: '2026-02-16', period: 'AM' },
    ]
    const entries = index([entry('2026-02-02', { attendance: 'Anwesend' })])

    const result = computeStudentSummary([student], threeDays, entries, DEFAULT_WEIGHTS)

    expect(result[1]?.pct).toBe(33.3)
  })

  it('returns no grade when nothing was marked', () => {
    const entries = index([entry('2026-02-02', { attendance: 'Anwesend' })])

    const result = computeStudentSummary([student], days, entries, DEFAULT_WEIGHTS)

    expect(result[1]?.calculatedGrade).toBeNull()
  })

  it('averages the two slots within a category', () => {
    const entries = index([entry('2026-02-02', { wiederholung1: 1, wiederholung2: 2 })])

    const result = computeStudentSummary([student], days, entries, DEFAULT_WEIGHTS)

    expect(result[1]?.calculatedGrade).toBe(1.5)
  })

  it('ignores categories with no mark rather than treating them as zero', () => {
    // Only Wiederholung is marked; the result must be that mark, not 1/4 of it.
    const entries = index([entry('2026-02-02', { wiederholung1: 4 })])

    const result = computeStudentSummary([student], days, entries, DEFAULT_WEIGHTS)

    expect(result[1]?.calculatedGrade).toBe(4)
  })

  it('combines categories using the configured weights', () => {
    const entries = index([entry('2026-02-02', { wiederholung1: 1, bericht1: 5 })])

    const weights = {
      weightWiederholung: 75,
      weightBericht: 25,
      weightMitarbeit: 0,
      weightPraktischeArbeit: 0,
    }
    // (1*75 + 5*25) / 100 = 2 exactly.
    const result = computeStudentSummary([student], days, entries, weights)

    expect(result[1]?.calculatedGrade).toBe(2)
  })

  it('skips days with no marks when averaging across days', () => {
    const entries = index([
      entry('2026-02-02', { wiederholung1: 1 }),
      entry('2026-02-09', { attendance: 'Anwesend' }),
    ])

    // The second day contributes nothing, so the average is the first day alone.
    const result = computeStudentSummary([student], days, entries, DEFAULT_WEIGHTS)

    expect(result[1]?.calculatedGrade).toBe(1)
  })

  it('averages across days that do have marks', () => {
    const entries = index([
      entry('2026-02-02', { wiederholung1: 1 }),
      entry('2026-02-09', { wiederholung1: 4 }),
    ])

    const result = computeStudentSummary([student], days, entries, DEFAULT_WEIGHTS)

    expect(result[1]?.calculatedGrade).toBe(2.5)
  })

  it('rounds the final grade to a half step', () => {
    const entries = index([
      entry('2026-02-02', { wiederholung1: 1 }),
      entry('2026-02-09', { wiederholung1: 2 }),
    ])

    // 1.5 is already a half step; 1 and 4 average to 2.5. Check a value that needs rounding.
    expect(
      computeStudentSummary([student], days, entries, DEFAULT_WEIGHTS)[1]?.calculatedGrade,
    ).toBe(1.5)

    const uneven = index([
      entry('2026-02-02', { wiederholung1: 1 }),
      entry('2026-02-09', { wiederholung1: 2.5 }),
    ])
    // (1 + 2.5) / 2 = 1.75 -> 2
    expect(
      computeStudentSummary([student], days, uneven, DEFAULT_WEIGHTS)[1]?.calculatedGrade,
    ).toBe(2)
  })

  it('avoids dividing by zero when every weight is zero', () => {
    const entries = index([entry('2026-02-02', { wiederholung1: 3 })])

    const zeroWeights = {
      weightWiederholung: 0,
      weightBericht: 0,
      weightMitarbeit: 0,
      weightPraktischeArbeit: 0,
    }
    const result = computeStudentSummary([student], days, entries, zeroWeights)

    expect(result[1]?.calculatedGrade).toBeNull()
  })

  it('reports zero percent when there are no teaching days at all', () => {
    const result = computeStudentSummary([student], [], {}, DEFAULT_WEIGHTS)

    expect(result[1]).toMatchObject({ alle: 0, pct: 0, calculatedGrade: null })
  })

  it('summarises each student independently', () => {
    const second: Student = { id: 2, firstName: 'Grace', lastName: 'Hopper', groupId: 1 }
    const entries = index([
      entry('2026-02-02', { attendance: 'Anwesend', wiederholung1: 1 }),
      { ...emptyEntry(2, '2026-02-02', 'AM'), attendance: 'Krank', wiederholung1: 5 },
    ])

    const result = computeStudentSummary([student, second], days, entries, DEFAULT_WEIGHTS)

    expect(result[1]?.calculatedGrade).toBe(1)
    expect(result[2]?.calculatedGrade).toBe(5)
    expect(result[1]?.anwesend).toBe(1)
    expect(result[2]?.anwesend).toBe(0)
  })
})
