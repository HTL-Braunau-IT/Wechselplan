import { describe, it, expect } from 'vitest'

import {
  computePeriodTurns,
  isBiweekly,
  isHolidayDate,
  normalizeCadence,
  periodMeetsOnWeek,
  weekdayDatesInRange,
} from '@/lib/schedule-cadence'
import type { Holiday } from '@/types/schedule'

describe('normalizeCadence', () => {
  it('defaults to weekly and clamps garbage', () => {
    expect(normalizeCadence(null)).toEqual({ weekInterval: 1, weekOffset: 0 })
    expect(normalizeCadence({ weekInterval: 0, weekOffset: 5 })).toEqual({
      weekInterval: 1,
      weekOffset: 0,
    })
  })

  it('wraps the offset into the interval', () => {
    expect(normalizeCadence({ weekInterval: 2, weekOffset: 3 })).toEqual({
      weekInterval: 2,
      weekOffset: 1,
    })
    expect(normalizeCadence({ weekInterval: 2, weekOffset: -1 })).toEqual({
      weekInterval: 2,
      weekOffset: 1,
    })
  })
})

describe('isBiweekly', () => {
  it('is true only when the interval exceeds one week', () => {
    expect(isBiweekly({ weekInterval: 1, weekOffset: 0 })).toBe(false)
    expect(isBiweekly({ weekInterval: 2, weekOffset: 0 })).toBe(true)
    expect(isBiweekly(null)).toBe(false)
  })
})

describe('periodMeetsOnWeek', () => {
  it('meets every week when weekly', () => {
    for (let i = 0; i < 6; i++)
      expect(periodMeetsOnWeek(i, { weekInterval: 1, weekOffset: 0 })).toBe(true)
  })

  it('A-week lane meets on even absolute weeks', () => {
    const cad = { weekInterval: 2, weekOffset: 0 }
    expect([0, 1, 2, 3, 4].map(i => periodMeetsOnWeek(i, cad))).toEqual([
      true,
      false,
      true,
      false,
      true,
    ])
  })

  it('B-week lane meets on odd absolute weeks (complements the A-week lane)', () => {
    const cad = { weekInterval: 2, weekOffset: 1 }
    expect([0, 1, 2, 3, 4].map(i => periodMeetsOnWeek(i, cad))).toEqual([
      false,
      true,
      false,
      true,
      false,
    ])
  })
})

describe('weekdayDatesInRange', () => {
  it('lists every Monday in the window, holidays included', () => {
    // 2025-09-01 is a Monday. Four Mondays through 2025-09-22.
    const dates = weekdayDatesInRange(new Date('2025-09-01'), new Date('2025-09-24'), 1)
    expect(dates.map(d => d.getDate())).toEqual([1, 8, 15, 22])
    dates.forEach(d => expect(d.getDay()).toBe(1))
  })
})

describe('isHolidayDate', () => {
  const holidays: Holiday[] = [
    { id: 1, name: 'Herbstferien', startDate: '2025-10-27', endDate: '2025-10-31' },
  ]
  it('matches a date inside the interval and rejects one outside', () => {
    expect(isHolidayDate(new Date('2025-10-28'), holidays)).toBe(true)
    expect(isHolidayDate(new Date('2025-10-20'), holidays)).toBe(false)
  })
})

describe('computePeriodTurns', () => {
  const window = { start: new Date('2025-09-01'), end: new Date('2025-11-30'), weekday: 1 }

  it('spreads weekly Mondays evenly across the Turnusse', () => {
    const terms = computePeriodTurns({ ...window, numberOfTerms: 2, holidays: [] })
    expect(terms.map(t => t.name)).toEqual(['TURNUS 1', 'TURNUS 2'])
    const total = terms.reduce((n, t) => n + t.weeks.length, 0)
    // 13 Mondays Sep 1 – Nov 24; split 7 / 6 (extra week lands in the first term).
    expect(total).toBe(13)
    expect(terms.map(t => t.weeks.length)).toEqual([7, 6])
  })

  it('a biweekly lane meets on half as many weeks as the weekly lane', () => {
    const weekly = computePeriodTurns({ ...window, numberOfTerms: 1, holidays: [] })
    const biweekly = computePeriodTurns({
      ...window,
      numberOfTerms: 1,
      holidays: [],
      cadence: { weekInterval: 2, weekOffset: 0 },
    })
    expect(weekly[0]!.weeks.length).toBe(13)
    expect(biweekly[0]!.weeks.length).toBe(7) // weeks 0,2,4,6,8,10,12
  })

  it('A-week and B-week lanes partition the weekly lane with no overlap', () => {
    const a = computePeriodTurns({
      ...window,
      numberOfTerms: 1,
      holidays: [],
      cadence: { weekInterval: 2, weekOffset: 0 },
    })
    const b = computePeriodTurns({
      ...window,
      numberOfTerms: 1,
      holidays: [],
      cadence: { weekInterval: 2, weekOffset: 1 },
    })
    const aDates = new Set(a[0]!.weeks.map(w => w.date))
    const bDates = b[0]!.weeks.map(w => w.date)
    expect(bDates.some(d => aDates.has(d))).toBe(false)
    expect(aDates.size + bDates.length).toBe(13)
  })

  it('honours a custom length on the first Turnus', () => {
    const terms = computePeriodTurns({
      ...window,
      numberOfTerms: 2,
      holidays: [],
      customLengths: { 'TURNUS 1': 3 },
    })
    expect(terms[0]!.weeks.length).toBe(3)
    expect(terms[0]!.customLength).toBe(3)
    expect(terms[1]!.weeks.length).toBe(10)
  })

  it('clamps custom lengths that exceed the available weeks (no negative/overlapping slices)', () => {
    // 13 Mondays available, but the first Turnus asks for 99.
    const terms = computePeriodTurns({
      ...window,
      numberOfTerms: 3,
      holidays: [],
      customLengths: { 'TURNUS 1': 99 },
    })
    const lengths = terms.map(t => t.weeks.length)
    lengths.forEach(n => expect(n).toBeGreaterThanOrEqual(0))
    // No week is assigned to more than one Turnus.
    const allDates = terms.flatMap(t => t.weeks.map(w => w.date))
    expect(new Set(allDates).size).toBe(allDates.length)
    expect(allDates.length).toBeLessThanOrEqual(13)
  })

  it('drops holiday weeks from teaching weeks but keeps biweekly parity stable across them', () => {
    // Make the 2nd Monday (2025-09-08, absolute index 1) a holiday.
    const holidays: Holiday[] = [
      { id: 1, name: 'x', startDate: '2025-09-08', endDate: '2025-09-08' },
    ]
    const aWeek = computePeriodTurns({
      ...window,
      numberOfTerms: 1,
      holidays,
      cadence: { weekInterval: 2, weekOffset: 0 },
    })
    // A-week lane meets on even indices (0,2,4,…); the holiday sits on odd index 1,
    // so it must not appear and must not shift which later weeks the lane meets on.
    const dates = aWeek[0]!.weeks.map(w => w.date)
    expect(dates).toContain('01.09.25')
    expect(dates).toContain('15.09.25')
    expect(dates).not.toContain('08.09.25')
  })

  it('lists every calendar week per Turnus in allWeeks, flagging holiday weeks', () => {
    const holidays: Holiday[] = [
      { id: 1, name: 'Herbstferien', startDate: '2025-09-08', endDate: '2025-09-08' },
    ]
    const terms = computePeriodTurns({ ...window, numberOfTerms: 2, holidays })

    // Teaching weeks stay holiday-free: 13 Mondays minus the one holiday = 12.
    const teachingTotal = terms.reduce((n, t) => n + t.weeks.length, 0)
    expect(teachingTotal).toBe(12)

    // allWeeks covers every calendar week (teaching + holiday) exactly once.
    const allDates = terms.flatMap(t => t.allWeeks!.map(w => w.date))
    expect(allDates.length).toBe(13)
    expect(new Set(allDates).size).toBe(13)

    // The holiday week is present, flagged, and carries its name.
    const holidayWeek = terms.flatMap(t => t.allWeeks!).find(w => w.date === '08.09.25')
    expect(holidayWeek).toMatchObject({ isHoliday: true, holidayName: 'Herbstferien' })

    // Within each Turnus the non-holiday allWeeks entries match its teaching weeks.
    for (const term of terms) {
      const teachingFromAll = term.allWeeks!.filter(w => !w.isHoliday).map(w => w.date)
      expect(teachingFromAll).toEqual(term.weeks.map(w => w.date))
    }
  })

  it('a start date trims earlier weeks and anchors the biweekly rhythm on itself', () => {
    const terms = computePeriodTurns({
      ...window,
      numberOfTerms: 1,
      holidays: [],
      // Offset is ignored when a start date is supplied: the date itself meets.
      cadence: { weekInterval: 2, weekOffset: 1 },
      patternStart: new Date('2025-09-15'),
    })
    const dates = terms[0]!.weeks.map(w => w.date)
    expect(dates[0]).toBe('15.09.25') // the start date is the first meeting
    expect(dates).toContain('29.09.25') // +2 weeks from the anchor
    expect(dates).not.toContain('01.09.25') // trimmed
    expect(dates).not.toContain('08.09.25') // trimmed
    expect(dates).not.toContain('22.09.25') // off-rhythm relative to the anchor
  })

  it('ignores a start date that predates the plan window', () => {
    const early = computePeriodTurns({
      ...window,
      numberOfTerms: 1,
      holidays: [],
      patternStart: new Date('2025-08-01'),
    })
    const plain = computePeriodTurns({ ...window, numberOfTerms: 1, holidays: [] })
    expect(early[0]!.weeks.map(w => w.date)).toEqual(plain[0]!.weeks.map(w => w.date))
  })

  it('skips excluded days like holidays and flags them in allWeeks', () => {
    const terms = computePeriodTurns({
      ...window,
      numberOfTerms: 1,
      holidays: [],
      excludedDates: ['08.09.25'],
    })
    const teaching = terms[0]!.weeks.map(w => w.date)
    expect(teaching).not.toContain('08.09.25')
    expect(teaching.length).toBe(12) // 13 Mondays minus the one excluded day

    const excludedWeek = terms[0]!.allWeeks!.find(w => w.date === '08.09.25')
    expect(excludedWeek).toMatchObject({ isExcluded: true, isHoliday: false })
  })

  it('keeps biweekly parity stable across an excluded day', () => {
    // Exclude the 2nd Monday (index 1); an A-week lane meets on even indices, so
    // the exclusion must not shift which later weeks it meets on.
    const aWeek = computePeriodTurns({
      ...window,
      numberOfTerms: 1,
      holidays: [],
      cadence: { weekInterval: 2, weekOffset: 0 },
      excludedDates: ['08.09.25'],
    })
    const dates = aWeek[0]!.weeks.map(w => w.date)
    expect(dates).toContain('01.09.25')
    expect(dates).toContain('15.09.25')
    expect(dates).not.toContain('08.09.25')
  })
})
