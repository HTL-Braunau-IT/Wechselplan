import { entryKey } from '@/lib/grades'
import type { NotenEntryRow, Student, TeachingDay, WeightConfig } from './types'

/**
 * Per-student attendance counts and the weighted grade the Noten grid derives
 * from the day-by-day marks.
 *
 * Extracted from the page so the weighting rules can be tested directly. Each
 * category may hold two marks; those are averaged first, then the categories
 * are combined using the configured weights — but only over the categories
 * that actually have a mark, so a missing category does not drag the result
 * toward zero. Days with no marks at all are skipped entirely.
 */

export type StudentSummary = {
  nichtAnwesend: number
  anwesend: number
  alle: number
  pct: number
  calculatedGrade: number | null
}

/** Average of the two slots in a category, tolerating either being empty. */
function pairAverage(first: number | null | undefined, second: number | null | undefined) {
  if (first != null && second != null) return (first + second) / 2
  return first ?? second ?? null
}

export function computeStudentSummary(
  students: Student[],
  teachingDays: TeachingDay[],
  entries: Record<string, NotenEntryRow>,
  weights: WeightConfig,
  /**
   * Today as YYYY-MM-DD. Attendance is only counted for days on or before it,
   * so future teaching days don't get scored as absences and drag the rate
   * down. Omit to count every day (used by unit tests over past-only data).
   */
  todayYmd?: string,
): Record<number, StudentSummary> {
  const out: Record<number, StudentSummary> = {}
  // Attendance is only meaningful for days that have already happened.
  const elapsedDays = todayYmd ? teachingDays.filter(day => day.date <= todayYmd) : teachingDays
  const totalDays = elapsedDays.length

  for (const student of students) {
    let anwesend = 0
    let nichtAnwesend = 0
    const dayGrades: number[] = []

    for (const day of elapsedDays) {
      const entry = entries[entryKey(student.id, day.date, day.period)]

      // Anything that is not an explicit "Anwesend" — including a day with
      // nothing recorded — counts as an absence.
      if (entry?.attendance === 'Anwesend') anwesend++
      else nichtAnwesend++

      const avgWiederholung = pairAverage(entry?.wiederholung1, entry?.wiederholung2)
      const avgBericht = pairAverage(entry?.bericht1, entry?.bericht2)
      const avgMitarbeit = pairAverage(entry?.mitarbeit1, entry?.mitarbeit2)
      const avgPraktisch = pairAverage(entry?.praktischeArbeit1, entry?.praktischeArbeit2)

      if (
        avgWiederholung == null &&
        avgBericht == null &&
        avgMitarbeit == null &&
        avgPraktisch == null
      ) {
        continue
      }

      // Divide by the weights actually in play, not the full 100.
      const divisor =
        (avgWiederholung != null ? weights.weightWiederholung : 0) +
        (avgBericht != null ? weights.weightBericht : 0) +
        (avgMitarbeit != null ? weights.weightMitarbeit : 0) +
        (avgPraktisch != null ? weights.weightPraktischeArbeit : 0)
      if (divisor === 0) continue

      const dayGrade =
        ((avgWiederholung ?? 0) * weights.weightWiederholung +
          (avgBericht ?? 0) * weights.weightBericht +
          (avgMitarbeit ?? 0) * weights.weightMitarbeit +
          (avgPraktisch ?? 0) * weights.weightPraktischeArbeit) /
        divisor
      dayGrades.push(dayGrade)
    }

    // Grades land on half steps, matching what the dropdowns offer.
    const calculatedGrade =
      dayGrades.length > 0
        ? Math.round((dayGrades.reduce((a, b) => a + b, 0) / dayGrades.length) * 2) / 2
        : null
    const pct = totalDays > 0 ? Math.round((anwesend / totalDays) * 1000) / 10 : 0

    out[student.id] = { nichtAnwesend, anwesend, alle: totalDays, pct, calculatedGrade }
  }

  return out
}
