/**
 * Second-semester planning appends to the first semester instead of replacing it.
 *
 * A plan is one `Schedule` row per class + weekday + year, and a lane's Turnusse
 * are replaced wholesale on save. Planning one semester computes Turnusse for
 * that half only, so saving them as-is would wipe the other half. These helpers
 * split a stored lane at the semester change and stitch the newly planned half
 * back together with the untouched one.
 *
 * Pure and client-safe: the Turnus step uses them on the blobs it already loads,
 * so the split is decided in one place (the browser's timezone) and the server
 * keeps its simple "replace the lane with what was sent" contract.
 */
import { isValid, parse } from 'date-fns'

import type { ScheduleTerm, TurnSchedule } from '@/types/schedule'

const turnName = (index: number) => `TURNUS ${index + 1}`

/** True when a stored week ("dd.MM.yy") lies before the semester change day. */
export function isBeforeSemesterChange(date: string, semesterChange: Date): boolean {
  const parsed = parse(date, 'dd.MM.yy', new Date())
  if (!isValid(parsed)) return false
  const cut = new Date(
    semesterChange.getFullYear(),
    semesterChange.getMonth(),
    semesterChange.getDate(),
  )
  return parsed < cut
}

export interface SemesterSplit {
  /** Turnusse (or their leading part) taught before the semester change, in order. */
  first: ScheduleTerm[]
  /** Turnusse lying wholly after the change, renumbered from "TURNUS 1". */
  second: ScheduleTerm[]
}

/**
 * Splits one lane's stored Turnusse at the semester change.
 *
 * A Turnus that straddles the change (a whole-year plan later switched to
 * "2. Semester") keeps only its weeks before it: everything from the change
 * onwards is what the second-semester planning is about to redefine. Its
 * `customLength` no longer describes the shortened Turnus, so it is dropped.
 */
export function splitLaneBySemester(
  lane: TurnSchedule | null | undefined,
  semesterChange: Date,
): SemesterSplit {
  const first: ScheduleTerm[] = []
  const second: ScheduleTerm[] = []
  for (const term of Object.values(lane ?? {})) {
    const weeks = Array.isArray(term.weeks) ? term.weeks : []
    const before = weeks.filter(week => isBeforeSemesterChange(week.date, semesterChange))
    if (before.length === 0) {
      second.push({ ...term, name: turnName(second.length) })
    } else if (before.length === weeks.length) {
      first.push(term)
    } else {
      first.push({
        name: term.name,
        weeks: before,
        holidays: term.holidays?.filter(holiday => new Date(holiday.startDate) < semesterChange),
      })
    }
  }
  return { first, second }
}

/**
 * The lane blob to save: the given runs of Turnusse in order (kept first half,
 * newly planned half, kept second half), numbered continuously ("TURNUS 1" …
 * "TURNUS n") — the naming every reader and the rotation rows rely on.
 */
export function joinTurns(...parts: ScheduleTerm[][]): TurnSchedule {
  return Object.fromEntries(
    parts.flat().map((term, index) => {
      const name = turnName(index)
      return [name, { ...term, name }]
    }),
  )
}

/** One half of the school year. */
export type PlanSemester = 'first' | 'second'
/** `TeacherAssignment.semester`: the whole year, or one half of it. */
export type AssignmentSemester = 'full' | PlanSemester

export function isPlanSemester(value: unknown): value is PlanSemester {
  return value === 'first' || value === 'second'
}

/** Does a teacher-assignment row apply during `semester`? Whole-year rows always do. */
export function appliesToSemester(rowSemester: string | null | undefined, semester: PlanSemester) {
  return rowSemester == null || rowSemester === 'full' || rowSemester === semester
}

/**
 * A run of consecutive Turnusse taught by one set of teachers. A whole-year plan
 * is a single block; a plan whose teachers change at the semester has two, and
 * the round-robin restarts in the second (`turnStart` is where it begins in the
 * lane, so column `turnStart + i` is the block's own turn `i`).
 */
export interface RotationBlock<A> {
  semester: AssignmentSemester
  turnStart: number
  turnKeys: string[]
  assignments: A[]
}

/**
 * Splits one lane into its rotation blocks — the single place that decides which
 * teachers a Turnus belongs to. Used by the on-screen overview, the PDF and the
 * rotation save, so the three cannot disagree.
 */
export function buildRotationBlocks<A extends { semester?: string | null }>(
  turns: TurnSchedule | null | undefined,
  assignments: A[],
  semesterChange: Date | null | undefined,
): RotationBlock<A>[] {
  const turnKeys = Object.keys(turns ?? {})
  const isSplit = assignments.some(a => isPlanSemester(a.semester))
  if (!isSplit || !semesterChange) {
    return [{ semester: 'full', turnStart: 0, turnKeys, assignments }]
  }
  const firstCount = turnKeys.filter(key => {
    const firstWeek = turns?.[key]?.weeks?.[0]
    return firstWeek != null && isBeforeSemesterChange(firstWeek.date, semesterChange)
  }).length
  const block = (semester: PlanSemester, turnStart: number, keys: string[]) => ({
    semester,
    turnStart,
    turnKeys: keys,
    assignments: assignments.filter(a => appliesToSemester(a.semester, semester)),
  })
  return [
    block('first', 0, turnKeys.slice(0, firstCount)),
    block('second', firstCount, turnKeys.slice(firstCount)),
  ].filter(b => b.turnKeys.length > 0)
}
