import { prisma } from '@/lib/prisma'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'
import { toLocalDateString } from '@/lib/date-utils'

/** `turn` is the Turnus the half-day belongs to ("TURNUS 1", …). */
export type TeachingDay = { date: string; period: string; turn: string }

function parseDateString(d: string): Date | null {
  const parts = d.split('.')
  if (parts.length !== 3 || parts[0] == null || parts[1] == null || parts[2] == null) return null
  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const year = parseInt(parts[2], 10)
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null
  if (year < 100) return new Date(2000 + year, month, day)
  return new Date(year, month, day)
}

/**
 * The half-days (date + AM/PM) on which a teacher has one group of a class, from
 * their TeacherRotation over the plan's turns/weeks; holidays are left out.
 *
 * Each weekday is its own plan with its own rotation and groups: with `weekday`
 * set, the dates come from that day's plan only (unscoped, a teacher on two days
 * got both days' rotations laid over whichever plan was created last). `null`
 * reads every day, for classes planned before per-day plans.
 *
 * Sorted by date, AM before PM. A group scheduled both halves of a date yields
 * two teaching days, since NotenEntry is keyed by (date, period).
 */
export async function teachingDaysFor(params: {
  teacherId: number
  classId: number
  groupId: number
  schoolYearId: number
  weekday: number | null
}): Promise<TeachingDay[]> {
  const { teacherId, classId, groupId, schoolYearId, weekday } = params
  const dayFilter = weekday != null ? { selectedWeekday: weekday } : {}

  const rotations = await prisma.teacherRotation.findMany({
    where: { teacherId, classId, groupId, schoolYearId, ...dayFilter },
  })
  if (rotations.length === 0) return []

  const schedule = await prisma.schedule.findFirst({
    where: { classId, schoolYearId, ...dayFilter },
    orderBy: { createdAt: 'desc' },
    include: {
      turns: {
        include: { weeks: true },
        orderBy: { order: 'asc' },
      },
    },
  })

  let scheduleData: Record<string, { weeks: Array<{ date: string; isHoliday: boolean }> }> = {}
  if (schedule?.turns && schedule.turns.length > 0) {
    scheduleData = normalizeToJsonFormat(
      schedule.turns.map(t => ({
        name: t.name,
        customLength: t.customLength,
        weeks: t.weeks.map(w => ({ date: w.date, week: w.week, isHoliday: w.isHoliday })),
      })),
    ) as Record<string, { weeks: Array<{ date: string; isHoliday: boolean }> }>
  } else if (schedule?.scheduleData && typeof schedule.scheduleData === 'object') {
    const data = schedule.scheduleData as Record<
      string,
      { weeks?: Array<{ date: string; isHoliday?: boolean }> }
    >
    for (const [k, v] of Object.entries(data)) {
      if (v?.weeks)
        scheduleData[k] = {
          weeks: v.weeks.map(w => ({ date: w.date, isHoliday: Boolean(w.isHoliday) })),
        }
    }
  }

  const teachingDays: TeachingDay[] = []
  const seen = new Set<string>()
  for (const rot of rotations) {
    const turnData = scheduleData[rot.turnId]
    if (!turnData?.weeks) continue
    for (const week of turnData.weeks) {
      if (week.isHoliday) continue
      const dateObj = parseDateString(week.date)
      if (!dateObj) continue
      const key = `${toLocalDateString(dateObj)}-${rot.period}`
      if (seen.has(key)) continue
      seen.add(key)
      teachingDays.push({
        date: toLocalDateString(dateObj),
        period: rot.period,
        turn: rot.turnId,
      })
    }
  }
  teachingDays.sort((a, b) => {
    const d = a.date.localeCompare(b.date)
    if (d !== 0) return d
    return a.period === 'AM' && b.period === 'PM'
      ? -1
      : a.period === 'PM' && b.period === 'AM'
        ? 1
        : 0
  })
  return teachingDays
}
