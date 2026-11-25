import { describe, expect, it } from 'vitest'

import {
  buildRotationBlocks,
  isBeforeSemesterChange,
  joinTurns,
  splitLaneBySemester,
} from '@/lib/schedule-semester'
import type { ScheduleTerm, TurnSchedule } from '@/types/schedule'

const CHANGE = new Date(2027, 1, 15) // 15.02.27

const term = (name: string, dates: string[], customLength?: number): ScheduleTerm => ({
  name,
  weeks: dates.map(date => ({ date, week: 'KW1', isHoliday: false })),
  holidays: [],
  ...(customLength ? { customLength } : {}),
})

const lane = (...terms: ScheduleTerm[]): TurnSchedule =>
  Object.fromEntries(terms.map(t => [t.name, t]))

describe('isBeforeSemesterChange', () => {
  it('treats the change day itself as second semester', () => {
    expect(isBeforeSemesterChange('14.02.27', CHANGE)).toBe(true)
    expect(isBeforeSemesterChange('15.02.27', CHANGE)).toBe(false)
  })

  it('ignores the time of day on the change date', () => {
    expect(isBeforeSemesterChange('15.02.27', new Date(2027, 1, 15, 23, 0))).toBe(false)
  })

  it('is false for a malformed date', () => {
    expect(isBeforeSemesterChange('', CHANGE)).toBe(false)
  })
})

describe('splitLaneBySemester', () => {
  it('separates the Turnusse at the change and renumbers the second half', () => {
    const { first, second } = splitLaneBySemester(
      lane(
        term('TURNUS 1', ['14.09.26', '21.09.26']),
        term('TURNUS 2', ['11.01.27', '18.01.27']),
        term('TURNUS 3', ['22.02.27', '01.03.27'], 2),
        term('TURNUS 4', ['07.06.27']),
      ),
      CHANGE,
    )
    expect(first.map(t => t.name)).toEqual(['TURNUS 1', 'TURNUS 2'])
    expect(second.map(t => t.name)).toEqual(['TURNUS 1', 'TURNUS 2'])
    expect(second[0]?.customLength).toBe(2)
    expect(second[1]?.weeks[0]?.date).toBe('07.06.27')
  })

  it('keeps only the leading weeks of a Turnus that straddles the change', () => {
    const { first, second } = splitLaneBySemester(
      lane(term('TURNUS 1', ['01.02.27', '08.02.27', '15.02.27', '22.02.27'], 4)),
      CHANGE,
    )
    expect(second).toEqual([])
    expect(first[0]?.weeks.map(w => w.date)).toEqual(['01.02.27', '08.02.27'])
    expect(first[0]?.customLength).toBeUndefined()
  })

  it('handles an empty or missing lane', () => {
    expect(splitLaneBySemester(null, CHANGE)).toEqual({ first: [], second: [] })
    expect(splitLaneBySemester({}, CHANGE)).toEqual({ first: [], second: [] })
  })
})

describe('joinTurns', () => {
  it('numbers the planned Turnusse after the kept ones', () => {
    const merged = joinTurns(
      [term('TURNUS 1', ['14.09.26']), term('TURNUS 2', ['11.01.27'])],
      [term('TURNUS 1', ['22.02.27']), term('TURNUS 2', ['07.06.27'])],
    )
    expect(Object.keys(merged)).toEqual(['TURNUS 1', 'TURNUS 2', 'TURNUS 3', 'TURNUS 4'])
    expect(merged['TURNUS 3']?.name).toBe('TURNUS 3')
    expect(merged['TURNUS 3']?.weeks[0]?.date).toBe('22.02.27')
    expect(merged['TURNUS 1']?.weeks[0]?.date).toBe('14.09.26')
  })

  it('re-planning the second semester leaves the first untouched', () => {
    const stored = joinTurns([term('TURNUS 1', ['14.09.26'])], [term('TURNUS 1', ['22.02.27'])])
    const { first, second } = splitLaneBySemester(stored, CHANGE)
    expect(first).toEqual([stored['TURNUS 1']])
    expect(second.map(t => t.name)).toEqual(['TURNUS 1'])
  })
})

describe('buildRotationBlocks', () => {
  const turns = lane(
    term('TURNUS 1', ['14.09.26']),
    term('TURNUS 2', ['11.01.27']),
    term('TURNUS 3', ['22.02.27']),
  )

  it('is one block over every Turnus for a whole-year plan', () => {
    const rows = [{ teacherId: 1, semester: 'full' }, { teacherId: 2 }]
    expect(buildRotationBlocks(turns, rows, CHANGE)).toEqual([
      {
        semester: 'full',
        turnStart: 0,
        turnKeys: ['TURNUS 1', 'TURNUS 2', 'TURNUS 3'],
        assignments: rows,
      },
    ])
  })

  it('gives each semester its own teachers and restarts the turn index', () => {
    const rows = [
      { teacherId: 1, semester: 'first' },
      { teacherId: 2, semester: 'second' },
    ]
    const blocks = buildRotationBlocks(turns, rows, CHANGE)
    expect(blocks.map(b => [b.semester, b.turnStart, b.turnKeys])).toEqual([
      ['first', 0, ['TURNUS 1', 'TURNUS 2']],
      ['second', 2, ['TURNUS 3']],
    ])
    expect(blocks[0]?.assignments.map(a => a.teacherId)).toEqual([1])
    expect(blocks[1]?.assignments.map(a => a.teacherId)).toEqual([2])
  })

  it('drops a semester that has no Turnusse', () => {
    const rows = [{ teacherId: 1, semester: 'first' }]
    const onlySecond = lane(term('TURNUS 1', ['22.02.27']))
    expect(buildRotationBlocks(onlySecond, rows, CHANGE).map(b => b.semester)).toEqual(['second'])
  })
})
