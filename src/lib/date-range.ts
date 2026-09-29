/**
 * Date-range validation shared by every path that writes a `SchoolHoliday` or a
 * `SchoolYear` (the admin data editor, the holiday settings routes, bulk import).
 *
 * An inverted range is not a cosmetic problem: `computePeriodTurns` treats a
 * holiday whose end precedes its start as matching no date at all, so the whole
 * break silently becomes teaching weeks in every plan saved afterwards. The DB
 * carries a CHECK constraint as the backstop; this gives the caller a readable 400.
 */

/** A date-ish value from a JSON body or a Prisma row; null when unparseable/absent. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string' || value.trim() === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * The problem with a holiday's range, or null when it is valid. Same-day
 * holidays (start === end, e.g. a Zwickeltag) are valid — the end is inclusive.
 */
export function holidayRangeError(startDate: unknown, endDate: unknown): string | null {
  const start = toDate(startDate)
  const end = toDate(endDate)
  if (!start || !end) return 'Beginn und Ende müssen gültige Daten sein.'
  if (end < start) return 'Das Ende der Ferien liegt vor ihrem Beginn.'
  return null
}

/** The problem with a school year's range, or null when it is valid. */
export function schoolYearRangeError(
  startDate: unknown,
  endDate: unknown,
  semesterChangeDate: unknown,
): string | null {
  const start = toDate(startDate)
  const end = toDate(endDate)
  const change = toDate(semesterChangeDate)
  if (!start || !end || !change)
    return 'Beginn, Ende und Semesterwechsel müssen gültige Daten sein.'
  if (end <= start) return 'Das Ende des Schuljahres muss nach seinem Beginn liegen.'
  if (change < start || change > end) {
    return 'Der Semesterwechsel muss innerhalb des Schuljahres liegen.'
  }
  return null
}
