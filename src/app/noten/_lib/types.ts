export type TeachingDay = { date: string; period: string }

export type Student = {
  id: number
  firstName: string
  lastName: string
  groupId: number | null
  sitzplatz?: string | null
}

export type ClassItem = { id: number; name: string; groupIds: number[] }

export type WeightConfig = {
  weightWiederholung: number
  weightBericht: number
  weightMitarbeit: number
  weightPraktischeArbeit: number
}

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

export const DEFAULT_WEIGHTS: WeightConfig = {
  weightWiederholung: 25,
  weightBericht: 25,
  weightMitarbeit: 25,
  weightPraktischeArbeit: 25,
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
