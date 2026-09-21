import { describe, expect, it } from 'vitest'
import {
  addDays,
  findInvariantViolations,
  formatPlanDate,
  isScheduledPlacement,
  isoWeekday,
  mondayOf,
  parsePlanDate,
  resolveGroupPlacements,
  resolveRoomOccupancy,
  resolveStudentPlacement,
  resolveTurnusName,
  weekdayDates,
} from '../resolve'
import type {
  AssignmentRow,
  Period,
  RotationRow,
  StudentPlacementPeriod,
  TurnDates,
} from '../types'

// ── Fixture ──────────────────────────────────────────────────────────────────
// Class 10, Monday (weekday 1), AM lane. Two groups, two teachers, two rooms:
//   Alice (T1) is fixed in E83; Bob (T2) is fixed in E84.
//   Base plan: group 1 → Alice/E83, group 2 → Bob/E84.
//   In TURNUS 2 the rotation swaps them: group 1 → Bob, group 2 → Alice, so the
//   groups follow their teacher into that teacher's fixed room.

const WD = 1
const AM: Period = 'AM'

function assignment(over: Partial<AssignmentRow>): AssignmentRow {
  return {
    classId: 10,
    className: '1AHET',
    groupId: null,
    teacherId: 0,
    teacherName: '',
    roomId: 0,
    roomName: '',
    subjectName: 'Werkstätte',
    learningContentName: 'LF',
    period: AM,
    selectedWeekday: WD,
    ...over,
  }
}

const assignments: AssignmentRow[] = [
  assignment({
    groupId: 1,
    teacherId: 1,
    teacherName: 'Alice A',
    roomId: 83,
    roomName: 'E83',
    subjectName: 'Infotech',
  }),
  assignment({
    groupId: 2,
    teacherId: 2,
    teacherName: 'Bob B',
    roomId: 84,
    roomName: 'E84',
    subjectName: 'Sigmatec',
  }),
  // A room used only on Tuesday → "free" (not "unused") when we query Monday.
  assignment({
    groupId: 1,
    teacherId: 3,
    teacherName: 'Cara C',
    roomId: 86,
    roomName: 'E86',
    selectedWeekday: 2,
  }),
]

const rotations: RotationRow[] = [
  { classId: 10, groupId: 1, teacherId: 2, turnName: 'TURNUS 2', period: AM, selectedWeekday: WD },
  { classId: 10, groupId: 2, teacherId: 1, turnName: 'TURNUS 2', period: AM, selectedWeekday: WD },
]

const classTurns: TurnDates[] = [
  { period: AM, turnName: 'TURNUS 1', dates: ['08.09.25'] },
  { period: AM, turnName: 'TURNUS 2', dates: ['15.09.25'] },
  { period: 'PM', turnName: 'TURNUS 1', dates: ['08.09.25', '15.09.25'] },
]

const rooms = [
  { name: 'E83', level: 'eg-e' as string | null },
  { name: 'E84', level: 'eg-e' as string | null },
  { name: 'E86', level: 'eg-e' as string | null },
  { name: 'E85', level: 'eg-e' as string | null }, // never assigned → unused
]

// ── Date helpers ─────────────────────────────────────────────────────────────

describe('formatPlanDate / parsePlanDate', () => {
  it('formats dd.MM.yy with zero padding', () => {
    expect(formatPlanDate(new Date(2025, 8, 8))).toBe('08.09.25')
    expect(formatPlanDate(new Date(2026, 11, 31))).toBe('31.12.26')
  })

  it('round-trips through parse', () => {
    const d = parsePlanDate('15.09.25')
    expect(d).not.toBeNull()
    expect(formatPlanDate(d!)).toBe('15.09.25')
  })

  it('rejects malformed / impossible dates', () => {
    expect(parsePlanDate('2025-09-15')).toBeNull()
    expect(parsePlanDate('32.01.25')).toBeNull()
    expect(parsePlanDate('')).toBeNull()
  })
})

describe('isoWeekday / mondayOf / weekdayDates', () => {
  it('maps Sunday to 7 and Monday to 1', () => {
    expect(isoWeekday(new Date(2025, 8, 8))).toBe(1) // Mon 08.09.2025
    expect(isoWeekday(new Date(2025, 8, 14))).toBe(7) // Sun
  })

  it('mondayOf returns the Monday of the week', () => {
    expect(formatPlanDate(mondayOf(new Date(2025, 8, 10)))).toBe('08.09.25') // Wed → Mon
  })

  it('weekdayDates enumerates Mon–Fri', () => {
    const wd = weekdayDates(new Date(2025, 8, 10))
    expect(wd).toEqual({
      1: '08.09.25',
      2: '09.09.25',
      3: '10.09.25',
      4: '11.09.25',
      5: '12.09.25',
    })
  })
})

describe('addDays', () => {
  it('shifts by whole days and crosses month boundaries', () => {
    expect(formatPlanDate(addDays(new Date(2025, 8, 30), 1))).toBe('01.10.25')
    expect(formatPlanDate(addDays(new Date(2025, 8, 8), 7))).toBe('15.09.25')
    expect(formatPlanDate(addDays(new Date(2025, 8, 8), 0))).toBe('08.09.25')
  })
})

describe('isScheduledPlacement', () => {
  const period = (over: Partial<StudentPlacementPeriod>): StudentPlacementPeriod => ({
    period: 'AM',
    state: 'none',
    roomName: null,
    level: null,
    teacherName: null,
    subjectName: null,
    learningContentName: null,
    groupId: null,
    turnName: null,
    ...over,
  })

  it('is true only when a period is placed in a real Turnus week', () => {
    expect(
      isScheduledPlacement([period({ state: 'placed', roomName: 'E83', turnName: 'TURNUS 1' })]),
    ).toBe(true)
  })

  it('is false when placed but outside any week (base-only, turnName null)', () => {
    // A base assignment resolves a room on the class weekday even outside a
    // meeting week — that must NOT count as a scheduled day.
    expect(
      isScheduledPlacement([period({ state: 'placed', roomName: 'E83', turnName: null })]),
    ).toBe(false)
  })

  it('is false when nothing is placed', () => {
    expect(isScheduledPlacement([period({}), period({ period: 'PM' })])).toBe(false)
  })
})

describe('resolveTurnusName', () => {
  it('finds the turn whose lane contains the date', () => {
    expect(resolveTurnusName(classTurns, AM, '15.09.25')).toBe('TURNUS 2')
    expect(resolveTurnusName(classTurns, AM, '08.09.25')).toBe('TURNUS 1')
  })

  it('is period-scoped (AM and PM lanes are independent)', () => {
    expect(resolveTurnusName(classTurns, 'PM', '15.09.25')).toBe('TURNUS 1')
  })

  it('returns null when the date is in no week (holiday / out of range)', () => {
    expect(resolveTurnusName(classTurns, AM, '22.09.25')).toBeNull()
  })
})

// ── Group placement (the rotation → room core) ───────────────────────────────

describe('resolveGroupPlacements', () => {
  it('places groups in their base rooms when no rotation applies (TURNUS 1)', () => {
    const turnus = { 10: 'TURNUS 1' }
    const p = resolveGroupPlacements(assignments, rotations, turnus, WD, AM)
    expect(p.find(x => x.groupId === 1)?.roomName).toBe('E83')
    expect(p.find(x => x.groupId === 2)?.roomName).toBe('E84')
  })

  it('follows the rotated teacher into their room (TURNUS 2 swap)', () => {
    const turnus = { 10: 'TURNUS 2' }
    const p = resolveGroupPlacements(assignments, rotations, turnus, WD, AM)
    const g1 = p.find(x => x.groupId === 1)!
    const g2 = p.find(x => x.groupId === 2)!
    expect(g1.teacherName).toBe('Bob B')
    expect(g1.roomName).toBe('E84')
    expect(g2.teacherName).toBe('Alice A')
    expect(g2.roomName).toBe('E83')
  })

  it('ignores assignments on other weekdays/periods', () => {
    const p = resolveGroupPlacements(assignments, rotations, { 10: 'TURNUS 1' }, WD, AM)
    expect(p.some(x => x.roomName === 'E86')).toBe(false)
  })
})

// ── Room occupancy (occupied / free / unused) ────────────────────────────────

describe('resolveRoomOccupancy', () => {
  it('classifies unused, free and occupied rooms', () => {
    const cells = resolveRoomOccupancy(rooms, assignments, rotations, { 10: 'TURNUS 1' }, WD, AM)
    const byName = Object.fromEntries(cells.map(c => [c.roomName, c]))
    expect(byName.E85!.state).toBe('unused') // no assignment all year
    expect(byName.E86!.state).toBe('free') // used Tuesday, not this Monday slot
    expect(byName.E83!.state).toBe('occupied')
    expect(byName.E84!.state).toBe('occupied')
  })

  it('shows the room-fixed teacher and the group currently rotated in (TURNUS 2)', () => {
    const cells = resolveRoomOccupancy(rooms, assignments, rotations, { 10: 'TURNUS 2' }, WD, AM)
    const e83 = cells.find(c => c.roomName === 'E83')!
    // E83 is Alice's fixed room; in TURNUS 2 group 2 is with Alice there.
    expect(e83.teacherName).toBe('Alice A')
    expect(e83.groups.map(g => g.groupId)).toEqual([2])
    const e84 = cells.find(c => c.roomName === 'E84')!
    expect(e84.teacherName).toBe('Bob B')
    expect(e84.groups.map(g => g.groupId)).toEqual([1])
  })

  it('returns a cell for every room', () => {
    const cells = resolveRoomOccupancy(rooms, assignments, rotations, {}, WD, AM)
    expect(cells).toHaveLength(rooms.length)
  })
})

// ── Student "where should I be?" ─────────────────────────────────────────────

describe('resolveStudentPlacement', () => {
  const roomLevel = (name: string) => (name === 'E84' ? 'eg-e' : null)

  it('resolves the AM room via the turnus rotation and reports empty PM', () => {
    const periods = resolveStudentPlacement(
      { classId: 10, groupId: 1 },
      assignments,
      rotations,
      classTurns,
      '15.09.25', // TURNUS 2 in AM lane
      WD,
      roomLevel,
    )
    const am = periods.find(p => p.period === 'AM')!
    const pm = periods.find(p => p.period === 'PM')!
    expect(am.state).toBe('placed')
    expect(am.roomName).toBe('E84') // group 1 follows Bob in TURNUS 2
    expect(am.teacherName).toBe('Bob B')
    expect(am.level).toBe('eg-e')
    expect(am.turnName).toBe('TURNUS 2')
    // No PM assignment for this group → nothing scheduled.
    expect(pm.state).toBe('none')
    expect(pm.roomName).toBeNull()
  })

  it('uses the base room when the date is in no turnus (null rotation)', () => {
    const periods = resolveStudentPlacement(
      { classId: 10, groupId: 1 },
      assignments,
      rotations,
      classTurns,
      '22.09.25', // in no AM week → base assignment
      WD,
      roomLevel,
    )
    const am = periods.find(p => p.period === 'AM')!
    expect(am.roomName).toBe('E83')
    expect(am.teacherName).toBe('Alice A')
    expect(am.turnName).toBeNull()
  })
})

// ── Invariant self-check ─────────────────────────────────────────────────────

describe('findInvariantViolations', () => {
  it('reports no violations for a clean fixture', () => {
    expect(findInvariantViolations(assignments)).toEqual([])
  })

  it('flags a teacher bound to two rooms on the same weekday/period', () => {
    const bad = [
      ...assignments,
      assignment({ groupId: 5, teacherId: 1, teacherName: 'Alice A', roomId: 82, roomName: 'E82' }),
    ]
    const violations = findInvariantViolations(bad)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      teacherId: 1,
      weekday: WD,
      period: AM,
      roomNames: ['E82', 'E83'],
    })
  })
})
