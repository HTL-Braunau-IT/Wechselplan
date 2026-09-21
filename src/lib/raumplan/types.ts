// Types for the Raumplan (room-occupancy) feature. These are decoupled from
// Prisma on purpose: the pure resolution functions in `resolve.ts` take these
// plain shapes so they can be unit-tested in `node` without a database. The
// query layer (`query.ts`) maps Prisma rows onto them.

export type Period = 'AM' | 'PM'

/** A room's state on a given weekday/half-day. */
export type RoomState =
  // A teacher is assigned to this room for this weekday/period.
  | 'occupied'
  // The room is used elsewhere this school year, but not on this slot.
  | 'free'
  // The room has no TeacherAssignment at all this school year (Schraffur).
  | 'unused'

/** A flattened `TeacherAssignment` row for the whole school year. */
export interface AssignmentRow {
  classId: number
  className: string
  groupId: number | null
  teacherId: number
  teacherName: string
  roomId: number
  roomName: string
  subjectName: string
  learningContentName: string
  period: Period
  selectedWeekday: number
}

/** A flattened `TeacherRotation` row. `turnName` is `TeacherRotation.turnId`,
 * which is a turn *label* (matches `ScheduleTurn.name`), not a foreign key. */
export interface RotationRow {
  classId: number
  groupId: number | null
  teacherId: number
  turnName: string
  period: Period
  selectedWeekday: number
}

/** A class's turns for one period lane, each with the meeting dates ("dd.MM.yy")
 * of the weeks that belong to it. Used to map a calendar date → Turnus name. */
export interface TurnDates {
  period: Period
  turnName: string
  dates: string[]
}

/** Which group is physically in which room on a given weekday/period, after
 * applying the per-Turnus teacher rotation. */
export interface GroupPlacement {
  classId: number
  className: string
  groupId: number | null
  teacherId: number
  teacherName: string
  roomId: number
  roomName: string
  subjectName: string
  learningContentName: string
  period: Period
  weekday: number
}

/** One room's occupancy on one (weekday, period) slot. */
export interface RoomCell {
  roomName: string
  level: string | null
  state: RoomState
  period: Period
  weekday: number
  teacherName: string | null
  subjectName: string | null
  groups: PlacedGroup[]
}

export interface PlacedGroup {
  classId: number
  className: string
  groupId: number | null
}

/** A single student's resolved room for one period on a chosen date. */
export interface StudentPlacementPeriod {
  period: Period
  state: 'placed' | 'none'
  roomName: string | null
  level: string | null
  teacherName: string | null
  subjectName: string | null
  learningContentName: string | null
  groupId: number | null
  turnName: string | null
}

/** A distinct (teacherId, weekday, period) that resolves to more than one room —
 * a violation of the working invariant the whole feature relies on. */
export interface InvariantViolation {
  teacherId: number
  teacherName: string
  weekday: number
  period: Period
  roomNames: string[]
}

// ── API response shapes (client-safe: no Prisma imports) ─────────────────────

export interface WeekOccupancy {
  schoolYearId: number
  /** Reference date the week was derived from, "dd.MM.yy". */
  reference: string
  /** weekday (1–5) → date "dd.MM.yy". */
  weekDates: Record<number, string>
  /** All room cells across weekday × period. */
  cells: RoomCell[]
}

export interface StudentPlacementResult {
  student: { id: number; name: string; className: string | null; groupId: number | null }
  date: string
  weekday: number
  periods: StudentPlacementPeriod[]
}
