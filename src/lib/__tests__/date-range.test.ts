import { describe, expect, it } from 'vitest'

import { holidayRangeError, schoolYearRangeError } from '@/lib/date-range'

describe('holidayRangeError', () => {
  it('accepts a normal range and a single day', () => {
    expect(holidayRangeError('2026-12-24', '2027-01-06')).toBeNull()
    expect(holidayRangeError('2026-12-08', '2026-12-08')).toBeNull()
    expect(holidayRangeError(new Date('2026-10-26'), new Date('2026-11-01'))).toBeNull()
  })

  it('rejects an end before the start (the Weihnachten 24.12. → 06.12. typo)', () => {
    expect(holidayRangeError('2026-12-24', '2026-12-06')).toMatch(/vor ihrem Beginn/)
  })

  it('rejects missing or unparseable dates', () => {
    expect(holidayRangeError('', '2026-12-06')).not.toBeNull()
    expect(holidayRangeError('2026-12-24', undefined)).not.toBeNull()
    expect(holidayRangeError('nope', '2026-12-06')).not.toBeNull()
  })
})

describe('schoolYearRangeError', () => {
  it('accepts a year with the semester change inside it', () => {
    expect(schoolYearRangeError('2026-09-14', '2027-07-09', '2027-02-15')).toBeNull()
  })

  it('rejects an inverted or empty year', () => {
    expect(schoolYearRangeError('2027-07-09', '2026-09-14', '2027-02-15')).not.toBeNull()
    expect(schoolYearRangeError('2026-09-14', '2026-09-14', '2026-09-14')).not.toBeNull()
  })

  it('rejects a semester change outside the year', () => {
    expect(schoolYearRangeError('2026-09-14', '2027-07-09', '2027-08-01')).toMatch(
      /Semesterwechsel/,
    )
  })
})
