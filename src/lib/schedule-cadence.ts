/**
 * Per-period cadence + Turnus week distribution — the pure core shared by the
 * creation wizard, the schedule APIs and the PDF exporters.
 *
 * AM and PM are independent lanes (see the prisma `Schedule` am/pm columns and
 * `ScheduleTurn.period`). Each lane has its own cadence: it can meet every week
 * or every 2nd week, starting on the A-week (offset 0) or the B-week (offset 1),
 * and its own number of Turnusse. Rotation itself stays per-Turnus and is
 * unchanged (see {@link file://./rotation.ts}) — biweekly only decides *which*
 * calendar weeks the lane meets on.
 *
 * The A/B alternation is evaluated over the ABSOLUTE weekday-week index within
 * the plan window, before holidays are removed, so a holiday week never flips
 * the parity of the weeks that follow it.
 */
import { addWeeks, format, isWithinInterval, setDay } from 'date-fns'

import type { Holiday, ScheduleTerm } from '@/types/schedule'

export interface PeriodCadence {
  /** 1 = every week, 2 = every 2nd week. */
  weekInterval: number
  /** Which slot of the interval the lane starts on (0 = A-week, 1 = B-week). */
  weekOffset: number
}

export const WEEKLY_CADENCE: PeriodCadence = { weekInterval: 1, weekOffset: 0 }

/** Clamp a (possibly partial / user-supplied) cadence into a valid one. */
export function normalizeCadence(
  cadence: Partial<PeriodCadence> | null | undefined,
): PeriodCadence {
  const interval =
    cadence?.weekInterval && cadence.weekInterval > 0 ? Math.floor(cadence.weekInterval) : 1
  const rawOffset = Math.floor(cadence?.weekOffset ?? 0)
  const offset = ((rawOffset % interval) + interval) % interval
  return { weekInterval: interval, weekOffset: offset }
}

/** True when the lane meets every 2nd (or rarer) week rather than weekly. */
export function isBiweekly(cadence: Partial<PeriodCadence> | null | undefined): boolean {
  return normalizeCadence(cadence).weekInterval > 1
}

/** Does the lane meet on the week at absolute index `weekIndex` (0-based)? */
export function periodMeetsOnWeek(
  weekIndex: number,
  cadence: Partial<PeriodCadence> | null | undefined,
): boolean {
  const { weekInterval, weekOffset } = normalizeCadence(cadence)
  return ((weekIndex % weekInterval) + weekInterval) % weekInterval === weekOffset
}

function toMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Whether `date` falls inside any holiday interval (inclusive, date-only). */
export function isHolidayDate(date: Date, holidays: Holiday[]): boolean {
  const check = toMidnight(date)
  return holidays.some(holiday =>
    isWithinInterval(check, {
      start: toMidnight(new Date(holiday.startDate)),
      end: toMidnight(new Date(holiday.endDate)),
    }),
  )
}

/**
 * Non-ISO calendar-week number, kept byte-for-byte compatible with the label the
 * creation wizard has always stored on `ScheduleWeek.week` ("KW##").
 */
export function calendarWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86_400_000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}

/**
 * Every date on `weekday` within [start, end], holidays INCLUDED, in absolute
 * order. Holidays are kept here on purpose so cadence parity can be evaluated
 * against the true calendar; they are filtered out per lane afterwards.
 *
 * @param weekday 0 = Sunday, 1 = Monday, … (matches `Schedule.selectedWeekday`).
 */
export function weekdayDatesInRange(start: Date, end: Date, weekday: number): Date[] {
  const dates: Date[] = []
  let date = setDay(new Date(start), weekday)
  if (date < start) date = addWeeks(date, 1)
  while (date <= end) {
    dates.push(new Date(date))
    date = addWeeks(date, 1)
  }
  return dates
}

export interface ComputePeriodTurnsOptions {
  start: Date
  end: Date
  /** 0 = Sunday, 1 = Monday, … */
  weekday: number
  numberOfTerms: number
  /** Optional fixed week count per Turnus, keyed "TURNUS 1", "TURNUS 2", … */
  customLengths?: Record<string, number>
  holidays: Holiday[]
  /** Defaults to weekly. */
  cadence?: Partial<PeriodCadence> | null
}

/**
 * Distribute the lane's meeting weeks across its Turnusse.
 *
 * 1. Enumerate the absolute weekday-weeks in the window.
 * 2. Keep only weeks the cadence meets on (A/B alternation).
 * 3. Drop holiday weeks — those are the lane's actual teaching weeks.
 * 4. Spread the teaching weeks evenly across the Turnusse, honouring any custom
 *    lengths, exactly like the legacy engine did.
 *
 * Returns one {@link ScheduleTerm} per Turnus (in order), each carrying its
 * non-holiday weeks and the holidays that fall inside its date span.
 */
export function computePeriodTurns(options: ComputePeriodTurnsOptions): ScheduleTerm[] {
  const { start, end, weekday, numberOfTerms, customLengths = {}, holidays } = options
  const cadence = normalizeCadence(options.cadence)

  const absoluteWeeks = weekdayDatesInRange(start, end, weekday)
  const teachingDates = absoluteWeeks.filter(
    (date, index) => periodMeetsOnWeek(index, cadence) && !isHolidayDate(date, holidays),
  )

  const terms = Math.max(0, Math.floor(numberOfTerms))
  const weeksPerTerm: number[] = new Array(terms).fill(0)
  let weeksLeft = teachingDates.length
  let turnsLeft = terms

  // Fixed custom lengths first.
  for (let i = 0; i < terms; i++) {
    const custom = customLengths[`TURNUS ${i + 1}`]
    if (custom && custom > 0) {
      weeksPerTerm[i] = custom
      weeksLeft -= custom
      turnsLeft--
    }
  }

  // Even split of the remainder over the terms without a custom length.
  for (let i = 0; i < terms; i++) {
    if (weeksPerTerm[i] === 0 && turnsLeft > 0) {
      const base = Math.floor(weeksLeft / turnsLeft)
      const extra = weeksLeft % turnsLeft > 0 ? 1 : 0
      weeksPerTerm[i] = base + extra
      weeksLeft -= weeksPerTerm[i]!
      turnsLeft--
    }
  }

  const result: ScheduleTerm[] = []
  let cursor = 0
  for (let i = 0; i < terms; i++) {
    const name = `TURNUS ${i + 1}`
    const count = weeksPerTerm[i] ?? 0
    const termDates = teachingDates.slice(cursor, cursor + count)
    cursor += count

    const weeks = termDates.map(date => ({
      week: `KW${calendarWeekNumber(date)}`,
      date: format(date, 'dd.MM.yy'),
      isHoliday: false,
    }))

    const spanStart = termDates[0]
    const spanEnd = termDates[termDates.length - 1]
    const termHolidays: Holiday[] =
      spanStart && spanEnd
        ? holidays.filter(holiday => {
            const hs = new Date(holiday.startDate)
            const he = new Date(holiday.endDate)
            return (
              isWithinInterval(hs, { start: spanStart, end: spanEnd }) ||
              isWithinInterval(he, { start: spanStart, end: spanEnd }) ||
              isWithinInterval(spanStart, { start: hs, end: he })
            )
          })
        : []

    const customLength = customLengths[name]
    result.push({
      name,
      weeks,
      holidays: termHolidays,
      ...(customLength && customLength > 0 ? { customLength } : {}),
    })
  }

  return result
}
