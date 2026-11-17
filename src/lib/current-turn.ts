/**
 * Which Turnus a schedule lane is in on a given lesson date — the pure core the
 * Notenliste auto-select uses to find the teacher's group "right now".
 *
 * Rules (the same the dashboard and the Raumplan follow):
 * - AM and PM are independent lanes that both number their Turnusse from
 *   "TURNUS 1", so only the requested period's turns are considered.
 * - A week's `date` is the lesson's own date ("dd.MM.yy"); a day belongs to the
 *   week spanning `[date, date + 7)`, which also tolerates older rows dated to
 *   the Monday. Holiday weeks never count.
 * - A lane with no teaching week covering the date does not meet then (the
 *   off-week of a biweekly lane, a holiday, outside the plan).
 */

export type LaneTurn = {
  name: string
  period?: string | null
  weeks: Array<{ date: string; isHoliday?: boolean | null }>
}

/** Local midnight of a "dd.MM.yy" (or "dd.MM.yyyy") date, or null. */
export function parseWeekDate(value: string): Date | null {
  const [d, m, y] = value.split('.').map(part => parseInt(part, 10))
  if (d == null || m == null || y == null || [d, m, y].some(Number.isNaN)) return null
  return new Date(y < 100 ? 2000 + y : y, m - 1, d)
}

/** Local midnight of a "YYYY-MM-DD" date, or null. */
export function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function dayOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * The date of `weekday` (1 = Monday … 5 = Friday) in the calendar week (Mon–Sun)
 * containing `reference`. Viewing Friday's group on a Tuesday asks about this
 * week's Friday, not about today.
 */
export function dateOfWeekdayInWeek(reference: Date, weekday: number): Date {
  const day = dayOf(reference)
  const mondayOffset = (day.getDay() + 6) % 7
  return addDays(day, weekday - 1 - mondayOffset)
}

/** The lane's turns: only those of `period` (rows without a lane count for either). */
export function laneTurns<T extends LaneTurn>(turns: T[], period: string): T[] {
  return turns.filter(turn => (turn.period ?? period) === period)
}

/** Teaching weeks of a turn as local-midnight start dates, in order. */
function teachingStarts(turn: LaneTurn): Date[] {
  return turn.weeks
    .filter(week => !week.isHoliday)
    .map(week => parseWeekDate(week.date))
    .filter((d): d is Date => d != null)
}

/** Whether the lane carries any dated teaching week at all. */
export function laneHasWeeks(turns: LaneTurn[]): boolean {
  return turns.some(turn => teachingStarts(turn).length > 0)
}

/** Name of the turn with a teaching week covering `date`, or null if the lane does not meet. */
export function turnOnDate(turns: LaneTurn[], date: Date): string | null {
  const target = dayOf(date)
  for (const turn of turns) {
    const hit = teachingStarts(turn).some(start => target >= start && target < addDays(start, 7))
    if (hit) return turn.name
  }
  return null
}

/**
 * The turn the lane is in for the lesson around `date`: the one meeting on it,
 * else the next lesson after it (a biweekly lane in its off-week, a holiday),
 * else — past the end of the plan — the last turn. Null for a lane without weeks.
 */
export function turnAroundDate(turns: LaneTurn[], date: Date): string | null {
  const onDate = turnOnDate(turns, date)
  if (onDate) return onDate
  const target = dayOf(date)
  let next: { name: string; start: Date } | null = null
  let last: { name: string; start: Date } | null = null
  for (const turn of turns) {
    for (const start of teachingStarts(turn)) {
      if (start > target && (!next || start < next.start)) next = { name: turn.name, start }
      if (!last || start > last.start) last = { name: turn.name, start }
    }
  }
  return next?.name ?? last?.name ?? null
}
