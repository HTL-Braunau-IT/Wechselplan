import type { NotenEntryRow } from './types'

/** The four assessment categories, in display order. */
export type CategoryKey = 'wiederholung' | 'bericht' | 'mitarbeit' | 'praktischeArbeit'

export const CATEGORIES: Array<{ key: CategoryKey; shortKey: string; fullKey: string }> = [
  { key: 'wiederholung', shortKey: 'noten.wiederholungShort', fullKey: 'noten.wiederholung' },
  { key: 'bericht', shortKey: 'noten.berichtShort', fullKey: 'noten.bericht' },
  { key: 'mitarbeit', shortKey: 'noten.mitarbeitShort', fullKey: 'noten.mitarbeit' },
  {
    key: 'praktischeArbeit',
    shortKey: 'noten.praktischeArbeitShort',
    fullKey: 'noten.praktischeArbeit',
  },
]

/** The NotenEntryRow field a (category, slot) pair writes to, e.g. `wiederholung2`. */
export function categoryField(key: CategoryKey, slot: 1 | 2): keyof NotenEntryRow {
  return `${key}${slot}` as keyof NotenEntryRow
}

/** The half-day marks the keyboard/pad accepts: 1–5 in half steps. */
export const GRADE_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const

export const PERIOD_SHORT: Record<string, string> = { AM: 'VM', PM: 'NM' }

/** Which category cell is focused for pad/keyboard entry, scoped to one day. */
export type ActiveCell = { studentId: number; category: CategoryKey; slot: 1 | 2 }

/** Austrian decimal comma for a mark; en dash for nothing. */
export function fmtGrade(n: number | null | undefined): string {
  if (n == null) return '–'
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

/** Nearest half step — the granularity the grade tints and marks use. */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2
}
