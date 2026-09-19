// WeightConfig and DEFAULT_WEIGHTS live in the shared resolver so the server
// routes, the client hook and this UI layer all agree on one definition and one
// fallback. Re-exported here so the many `from '../_lib/types'` imports still work.
export { DEFAULT_WEIGHTS, type WeightConfig } from '@/lib/noten-weights'

export type TeachingDay = { date: string; period: string }

export type Student = {
  id: number
  firstName: string
  lastName: string
  groupId: number | null
  sitzplatz?: string | null
}

/** A student card's position on the free-placement Sitzplan canvas, in pixels. */
export type SeatPosition = { x: number; y: number }

/** Teacher's personal seating layout for a group: studentId → canvas position. */
export type SeatingLayout = Record<number, SeatPosition>

export type ClassItem = { id: number; name: string; groupIds: number[] }

export type NotenEntryRow = {
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

export type SearchByNameMatch = {
  studentId: number
  firstName: string
  lastName: string
  classId: number
  className: string
  groupId: number
}

export type SearchByDateMatch = {
  classId: number
  className: string
  groupId: number
  period: string
}

export type FinalGradePerStudent = {
  first: { grade: number | null; conductNoteWish: string | null }
  second: { grade: number | null; conductNoteWish: string | null }
}

/** A blank entry, used whenever a student/day pair has nothing recorded yet. */
export function emptyEntry(studentId: number, date: string, period: string): NotenEntryRow {
  return {
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
  }
}
