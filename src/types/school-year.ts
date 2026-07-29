/** Label-only type for backward compatibility (e.g. "2025/2026") */
export type SchoolYear = `${number}/${number}`

/** School year as returned from GET /api/school-years (from DB) */
export interface SchoolYearFromApi {
  id: number
  label: string
  startDate: string
  endDate: string
  semesterChangeDate: string
  /** Admin-set flag marking the active year; authoritative over date derivation. At most one is true. */
  isCurrent: boolean | null
}

export interface SchoolYearOption {
  value: SchoolYear
  label: string
}

export const isValidSchoolYear = (year: string): year is SchoolYear => {
  const pattern = /^\d{4}\/\d{4}$/
  if (!pattern.test(year)) return false

  const parts = year.split('/')
  if (parts.length !== 2) return false

  const [start, end] = parts.map(Number) as [number, number]
  return end === start + 1
}

/**
 * Derive current semester from the school year's semesterChangeDate (day when first semester ends / second starts).
 * If referenceDate is before that date (start-of-day), returns 'first'; otherwise 'second'.
 */
export function getCurrentSemesterFromSchoolYear(
  semesterChangeDate: string,
  referenceDate: Date = new Date(),
): 'first' | 'second' {
  const change = new Date(semesterChangeDate)
  const ref = new Date(referenceDate)
  change.setHours(0, 0, 0, 0)
  ref.setHours(0, 0, 0, 0)
  return ref < change ? 'first' : 'second'
}

/** Derive which school year is "current" by comparing today with each year's startDate/endDate */
export function getCurrentSchoolYearFromList(years: SchoolYearFromApi[]): SchoolYearFromApi | null {
  const now = new Date()
  for (const y of years) {
    const start = new Date(y.startDate)
    const end = new Date(y.endDate)
    if (now >= start && now <= end) return y
  }
  return null
}

/**
 * Resolve the active school year. The admin-set `isCurrent` flag wins when
 * present; otherwise fall back to date derivation. This matters over the summer
 * break, when no year's [start, end] range contains "now" and date derivation
 * alone returns null.
 */
export function resolveCurrentSchoolYear(years: SchoolYearFromApi[]): SchoolYearFromApi | null {
  return years.find(y => y.isCurrent) ?? getCurrentSchoolYearFromList(years)
}

const STORAGE_KEY = 'schoolYearId'

export function getStoredSchoolYearId(): number | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return null
  const n = parseInt(raw, 10)
  return Number.isNaN(n) ? null : n
}

export function setStoredSchoolYearId(id: number): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, String(id))
}
