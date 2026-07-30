import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'
import { toLocalDateString } from '@/lib/date-utils'
import { requireAccess } from '@/lib/api-guard'

type TeachingDay = { date: string; period: string }

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
 * GET: Returns array of { date, period } for which the current teacher has this class+group.
 * Uses TeacherRotation + schedule turns/weeks; excludes holidays.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isFeatureEnabled('noten'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const classIdParam = searchParams.get('classId')
    const groupIdParam = searchParams.get('groupId')
    const schoolYearIdParam = searchParams.get('schoolYearId')

    if (!classIdParam || !groupIdParam) {
      return NextResponse.json({ error: 'classId and groupId required' }, { status: 400 })
    }
    const classId = parseInt(classIdParam, 10)
    const groupId = parseInt(groupIdParam, 10)
    if (Number.isNaN(classId) || Number.isNaN(groupId)) {
      return NextResponse.json({ error: 'Invalid classId or groupId' }, { status: 400 })
    }

    let schoolYearId: number | undefined = schoolYearIdParam
      ? parseInt(schoolYearIdParam, 10)
      : undefined
    if (schoolYearId == null || Number.isNaN(schoolYearId)) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true },
      })
      schoolYearId =
        current?.id ??
        (
          await prisma.schoolYear.findFirst({
            orderBy: { startDate: 'desc' },
            select: { id: true },
          })
        )?.id
    }
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    const isAssignedToClass = await prisma.teacherAssignment.findFirst({
      where: { teacherId: teacher.id, classId, schoolYearId },
    })
    if (!isAssignedToClass) {
      return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
    }

    const rotations = await prisma.teacherRotation.findMany({
      where: { teacherId: teacher.id, classId, groupId },
    })
    if (rotations.length === 0) {
      return NextResponse.json({ teachingDays: [] })
    }

    const schedule = await prisma.schedule.findFirst({
      where: { classId, schoolYearId },
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
        teachingDays.push({ date: toLocalDateString(dateObj), period: rot.period })
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

    // When same date has both AM and PM (same group), keep only one day per date (prefer AM)
    const seenDates = new Set<string>()
    const teachingDaysOnePerDate = teachingDays.filter(day => {
      if (seenDates.has(day.date)) return false
      seenDates.add(day.date)
      return true
    })

    return NextResponse.json({ teachingDays: teachingDaysOnePerDate })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/teaching-days',
      type: 'fetch-teaching-days',
    })
    return NextResponse.json({ error: 'Failed to fetch teaching days' }, { status: 500 })
  }
}
