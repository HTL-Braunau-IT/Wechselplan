import { describe, expect, it } from 'vitest'
import { dateOfWeekdayInWeek, laneTurns, turnAroundDate, turnOnDate } from '@/lib/current-turn'

const turn = (name: string, period: string, dates: string[], holiday: string[] = []) => ({
  name,
  period,
  weeks: [
    ...dates.map(date => ({ date, isHoliday: false })),
    ...holiday.map(date => ({ date, isHoliday: true })),
  ],
})

describe('dateOfWeekdayInWeek', () => {
  it('gives the weekday of the same Mon–Sun week', () => {
    const tue = new Date(2026, 10, 17)
    expect(dateOfWeekdayInWeek(tue, 1)).toEqual(new Date(2026, 10, 16))
    expect(dateOfWeekdayInWeek(tue, 5)).toEqual(new Date(2026, 10, 20))
    expect(dateOfWeekdayInWeek(new Date(2026, 10, 22), 1)).toEqual(new Date(2026, 10, 16))
  })
})

describe('turnOnDate', () => {
  const lane = [
    turn('TURNUS 1', 'PM', ['06.11.26', '13.11.26']),
    turn('TURNUS 2', 'PM', ['20.11.26', '27.11.26']),
  ]

  it('finds the turn of the lesson date, boundary included', () => {
    expect(turnOnDate(lane, new Date(2026, 10, 13))).toBe('TURNUS 1')
    expect(turnOnDate(lane, new Date(2026, 10, 20))).toBe('TURNUS 2')
  })

  it('returns null when the lane does not meet', () => {
    expect(turnOnDate(lane, new Date(2026, 11, 4))).toBeNull()
    const biweekly = [turn('TURNUS 1', 'PM', ['09.11.26', '23.11.26'])]
    expect(turnOnDate(biweekly, new Date(2026, 10, 16))).toBeNull()
  })

  it('ignores holiday weeks', () => {
    const withHoliday = [turn('TURNUS 1', 'PM', ['09.11.26'], ['16.11.26'])]
    expect(turnOnDate(withHoliday, new Date(2026, 10, 16))).toBeNull()
  })
})

describe('laneTurns', () => {
  it('keeps the AM and PM lanes apart', () => {
    const turns = [
      turn('TURNUS 1', 'AM', ['16.11.26']),
      turn('TURNUS 1', 'PM', ['02.11.26']),
      turn('TURNUS 2', 'AM', ['23.11.26']),
      turn('TURNUS 2', 'PM', ['16.11.26']),
    ]
    expect(turnOnDate(laneTurns(turns, 'PM'), new Date(2026, 10, 16))).toBe('TURNUS 2')
    expect(turnOnDate(laneTurns(turns, 'AM'), new Date(2026, 10, 16))).toBe('TURNUS 1')
  })
})

describe('turnAroundDate', () => {
  const biweekly = [
    turn('TURNUS 1', 'PM', ['02.11.26', '16.11.26']),
    turn('TURNUS 2', 'PM', ['30.11.26']),
  ]

  it('uses the next lesson in an off-week', () => {
    expect(turnAroundDate(biweekly, new Date(2026, 10, 23))).toBe('TURNUS 2')
  })

  it('uses the last turn after the plan ends', () => {
    expect(turnAroundDate(biweekly, new Date(2027, 1, 1))).toBe('TURNUS 2')
  })
})
