// Pure occupancy resolution for the Raumplan feature. No Prisma, no I/O — every
// function takes plain rows (see `types.ts`) so it can be unit-tested in `node`.
//
// The model, as locked with the user (see docs/raumplan/HANDOFF.md):
//   - `TeacherAssignment(class, group, weekday, period) → teacher, room, subject`
//     is the base binding. The teacher — and therefore the room — is effectively
//     fixed across the year for a given (teacher, weekday, period). Working
//     invariant: (teacher, weekday, period) → exactly one room.
//   - `TeacherRotation(class, group, turnName, weekday, period) → teacher` swaps
//     which teacher a group is with per Turnus. A group therefore follows its
//     rotated teacher into that teacher's (fixed) room.
//   - A calendar date maps to a Turnus name via the class's own schedule weeks
//     (`ScheduleWeek.date` "dd.MM.yy" → `ScheduleTurn.name`), per period lane.

import type {
  AssignmentRow,
  GroupPlacement,
  InvariantViolation,
  Period,
  PlacedGroup,
  RoomCell,
  RoomState,
  RotationRow,
  StudentPlacementPeriod,
  TurnDates,
} from './types'

export const PERIODS: readonly Period[] = ['AM', 'PM'] as const
export const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5] as const

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Format a Date as "dd.MM.yy" to match `ScheduleWeek.date`. */
export function formatPlanDate(date: Date): string {
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${pad2(date.getFullYear() % 100)}`
}

/** Parse "dd.MM.yy" back to a Date (local, midnight). Returns null if malformed.
 * Two-digit years are read as 2000–2099, which is correct for this app's span. */
export function parsePlanDate(value: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(value.trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = 2000 + Number(m[3])
  const d = new Date(year, month - 1, day)
  if (d.getDate() !== day || d.getMonth() !== month - 1) return null
  return d
}

/** ISO weekday (1 = Monday … 7 = Sunday) for a Date. */
export function isoWeekday(date: Date): number {
  const js = date.getDay() // 0 = Sunday
  return js === 0 ? 7 : js
}

/** The Monday of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - (isoWeekday(d) - 1))
  return d
}

/** Mon–Fri dates ("dd.MM.yy") for the week containing `date`, keyed by weekday. */
export function weekdayDates(date: Date): Record<number, string> {
  const monday = mondayOf(date)
  const out: Record<number, string> = {}
  for (const wd of WEEKDAYS) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + (wd - 1))
    out[wd] = formatPlanDate(d)
  }
  return out
}

/** Which Turnus (by name) a date falls into for a class's period lane, or null
 * if the date is in no week of that lane (holiday, out of range, wrong day). */
export function resolveTurnusName(
  turns: readonly TurnDates[],
  period: Period,
  date: string,
): string | null {
  for (const turn of turns) {
    if (turn.period !== period) continue
    if (turn.dates.includes(date)) return turn.turnName
  }
  return null
}

const nameKey = (teacherId: number, weekday: number, period: Period) =>
  `${teacherId}|${weekday}|${period}`

/** Map of teacherId → display name, built from assignment rows. */
function teacherNames(assignments: readonly AssignmentRow[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const a of assignments) if (!m.has(a.teacherId)) m.set(a.teacherId, a.teacherName)
  return m
}

/** The room a teacher occupies on (weekday, period) — the invariant's single
 * room. Returns the first matching assignment (rooms are keyed by name). */
function roomAssignmentOf(
  assignments: readonly AssignmentRow[],
  teacherId: number,
  weekday: number,
  period: Period,
): AssignmentRow | null {
  for (const a of assignments) {
    if (a.teacherId === teacherId && a.selectedWeekday === weekday && a.period === period) return a
  }
  return null
}

/** The effective teacher for a base assignment on a given Turnus: the rotation
 * override if one exists, otherwise the assignment's own teacher. */
function effectiveTeacherId(
  base: AssignmentRow,
  rotations: readonly RotationRow[],
  turnName: string | null,
): number {
  if (turnName == null) return base.teacherId
  for (const r of rotations) {
    if (
      r.classId === base.classId &&
      r.groupId === base.groupId &&
      r.period === base.period &&
      r.selectedWeekday === base.selectedWeekday &&
      r.turnName === turnName
    ) {
      return r.teacherId
    }
  }
  return base.teacherId
}

/**
 * Resolve which group is physically in which room on one (weekday, period).
 *
 * `assignments` is the whole school-year set; this filters to the slot itself.
 * `turnusByClass` maps a classId → the Turnus name active for that class on the
 * chosen date (already resolved per period lane by the caller). A group follows
 * its rotated teacher into that teacher's fixed room.
 */
export function resolveGroupPlacements(
  assignments: readonly AssignmentRow[],
  rotations: readonly RotationRow[],
  turnusByClass: Readonly<Record<number, string | null>>,
  weekday: number,
  period: Period,
): GroupPlacement[] {
  const names = teacherNames(assignments)
  const placements: GroupPlacement[] = []

  for (const base of assignments) {
    if (base.selectedWeekday !== weekday || base.period !== period) continue

    const turnName = turnusByClass[base.classId] ?? null
    const teacherId = effectiveTeacherId(base, rotations, turnName)
    const target = roomAssignmentOf(assignments, teacherId, weekday, period) ?? base

    placements.push({
      classId: base.classId,
      className: base.className,
      groupId: base.groupId,
      teacherId,
      teacherName: names.get(teacherId) ?? target.teacherName,
      roomId: target.roomId,
      roomName: target.roomName,
      subjectName: target.subjectName,
      learningContentName: target.learningContentName,
      period,
      weekday,
    })
  }

  return placements
}

/**
 * Full per-room occupancy for one (weekday, period). Every room in `rooms` gets
 * a cell: `unused` (no assignment all year → Schraffur), `free` (used elsewhere
 * this year but not this slot), or `occupied` (a teacher is here — with the
 * group(s) currently rotated in).
 */
export function resolveRoomOccupancy(
  rooms: readonly { name: string; level: string | null }[],
  assignments: readonly AssignmentRow[],
  rotations: readonly RotationRow[],
  turnusByClass: Readonly<Record<number, string | null>>,
  weekday: number,
  period: Period,
): RoomCell[] {
  const placements = resolveGroupPlacements(assignments, rotations, turnusByClass, weekday, period)

  const groupsByRoom = new Map<string, PlacedGroup[]>()
  for (const p of placements) {
    const list = groupsByRoom.get(p.roomName) ?? []
    list.push({ classId: p.classId, className: p.className, groupId: p.groupId })
    groupsByRoom.set(p.roomName, list)
  }

  const usedThisYear = new Set(assignments.map(a => a.roomName))
  const slotAssignments = new Map<string, AssignmentRow[]>()
  for (const a of assignments) {
    if (a.selectedWeekday !== weekday || a.period !== period) continue
    const list = slotAssignments.get(a.roomName) ?? []
    list.push(a)
    slotAssignments.set(a.roomName, list)
  }

  return rooms.map(room => {
    let state: RoomState
    let teacherName: string | null = null
    let subjectName: string | null = null

    if (!usedThisYear.has(room.name)) {
      state = 'unused'
    } else {
      const slot = slotAssignments.get(room.name) ?? []
      if (slot.length === 0) {
        state = 'free'
      } else {
        state = 'occupied'
        // The room's fixed teacher(s) for this slot. Normally one; if a room is
        // shared, join the distinct names so nothing is silently dropped.
        const distinctTeachers = [...new Set(slot.map(a => a.teacherName))]
        teacherName = distinctTeachers.join(' / ')
        subjectName = [...new Set(slot.map(a => a.subjectName))].join(' / ')
      }
    }

    return {
      roomName: room.name,
      level: room.level,
      state,
      period,
      weekday,
      teacherName,
      subjectName,
      groups: groupsByRoom.get(room.name) ?? [],
    }
  })
}

/**
 * "Where should I be?" for one student on a chosen date. For each period lane it
 * resolves the class's Turnus for that date, applies the rotation, and follows
 * the resulting teacher into their room.
 */
export function resolveStudentPlacement(
  student: { classId: number; groupId: number | null },
  assignments: readonly AssignmentRow[],
  rotations: readonly RotationRow[],
  classTurns: readonly TurnDates[],
  date: string,
  weekday: number,
  roomLevel: (roomName: string) => string | null,
): StudentPlacementPeriod[] {
  const names = teacherNames(assignments)

  return PERIODS.map(period => {
    const turnName = resolveTurnusName(classTurns, period, date)

    // The group's base assignment for this class/group/weekday/period.
    const base = assignments.find(
      a =>
        a.classId === student.classId &&
        a.groupId === student.groupId &&
        a.selectedWeekday === weekday &&
        a.period === period,
    )

    if (!base) {
      return emptyStudentPeriod(period, turnName)
    }

    const teacherId = effectiveTeacherId(base, rotations, turnName)
    const target = roomAssignmentOf(assignments, teacherId, weekday, period) ?? base

    return {
      period,
      state: 'placed',
      roomName: target.roomName,
      level: roomLevel(target.roomName),
      teacherName: names.get(teacherId) ?? target.teacherName,
      subjectName: target.subjectName,
      learningContentName: target.learningContentName,
      groupId: student.groupId,
      turnName,
    }
  })
}

function emptyStudentPeriod(period: Period, turnName: string | null): StudentPlacementPeriod {
  return {
    period,
    state: 'none',
    roomName: null,
    level: null,
    teacherName: null,
    subjectName: null,
    learningContentName: null,
    groupId: null,
    turnName,
  }
}

/**
 * Find every (teacher, weekday, period) that resolves to more than one distinct
 * room — a violation of the working invariant the resolution relies on. Used by
 * the invariant self-check (build step 1) and surfaced for diagnostics.
 */
export function findInvariantViolations(
  assignments: readonly AssignmentRow[],
): InvariantViolation[] {
  const rooms = new Map<string, Set<string>>()
  const meta = new Map<
    string,
    { teacherId: number; teacherName: string; weekday: number; period: Period }
  >()

  for (const a of assignments) {
    const key = nameKey(a.teacherId, a.selectedWeekday, a.period)
    const set = rooms.get(key) ?? new Set<string>()
    set.add(a.roomName)
    rooms.set(key, set)
    if (!meta.has(key)) {
      meta.set(key, {
        teacherId: a.teacherId,
        teacherName: a.teacherName,
        weekday: a.selectedWeekday,
        period: a.period,
      })
    }
  }

  const violations: InvariantViolation[] = []
  for (const [key, set] of rooms) {
    if (set.size <= 1) continue
    const m = meta.get(key)!
    violations.push({ ...m, roomNames: [...set].sort() })
  }
  return violations
}
