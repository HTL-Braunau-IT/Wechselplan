import { describe, it, expect } from 'vitest'
import { resolveCurrentSchoolYear, type SchoolYearFromApi } from '../school-year'

function makeYear(partial: Partial<SchoolYearFromApi> & { id: number }): SchoolYearFromApi {
  return {
    label: `year-${partial.id}`,
    startDate: '1990-09-01',
    endDate: '1991-07-31',
    semesterChangeDate: '1991-02-01',
    isCurrent: null,
    ...partial,
  }
}

describe('resolveCurrentSchoolYear', () => {
  // A range wide enough to always contain "now", so date derivation picks it.
  const inRange = makeYear({ id: 1, startDate: '2000-01-01', endDate: '2100-01-01' })
  // Flagged but its date range is firmly in the past.
  const flaggedPast = makeYear({ id: 2, isCurrent: true })

  it('prefers the admin-set isCurrent flag over date derivation', () => {
    expect(resolveCurrentSchoolYear([inRange, flaggedPast])?.id).toBe(2)
  })

  it('falls back to date derivation when nothing is flagged', () => {
    expect(resolveCurrentSchoolYear([inRange])?.id).toBe(1)
  })

  it('returns null when nothing is flagged and no range contains now (summer break)', () => {
    expect(resolveCurrentSchoolYear([makeYear({ id: 3 })])).toBeNull()
  })
})
