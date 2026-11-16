import { prisma } from '@/lib/prisma'
import { planClassIdsFor, weekdayGroupMap } from '@/lib/weekday-groups'
import { teachingDaysFor } from '@/lib/teaching-days'

/**
 * Writes Online-Shell results into the Noten grid as lesson marks (NotenEntry).
 *
 * A NotenEntry belongs to one half-day the teacher has a group: (teacher, the
 * student's real class, the student's group on that weekday, school year, date,
 * AM/PM). Online-Shell names the student (Entra oid), the half-day and the mark;
 * everything else is resolved here, and the half-day must be one of the
 * teacher's teaching days for the student's group, so the mark lands in a
 * column the Noten page actually shows.
 *
 * Only the chosen column is touched; attendance, notes and the other marks of
 * the same entry stay as they are. An existing different mark is kept unless
 * `overwrite` is set.
 */

export const ONLINE_SHELL_GRADE_FIELDS = [
  'praktischeArbeit1',
  'praktischeArbeit2',
  'mitarbeit1',
  'mitarbeit2',
  'wiederholung1',
  'wiederholung2',
  'bericht1',
  'bericht2',
] as const
export type OnlineShellGradeField = (typeof ONLINE_SHELL_GRADE_FIELDS)[number]

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

export type OnlineShellGradeEntry = {
  studentOid: string
  /** YYYY-MM-DD */
  date: string
  period: 'AM' | 'PM'
  grade: number
}

export type OnlineShellGradeResult = {
  studentOid: string
  status:
    | 'written'
    | 'unchanged'
    | 'exists'
    | 'invalid'
    | 'unknown_student'
    | 'no_school_year'
    | 'no_group'
    | 'not_teaching_day'
  /** The mark already in the cell (status 'exists'). */
  existing?: number | null
}

export async function writeOnlineShellGrades(params: {
  teacherId: number
  classId: number
  field: OnlineShellGradeField
  overwrite: boolean
  entries: OnlineShellGradeEntry[]
}): Promise<OnlineShellGradeResult[]> {
  const { teacherId, classId, field, overwrite, entries } = params

  const planIds = await planClassIdsFor(prisma, classId)
  const years = await prisma.schoolYear.findMany({
    select: { id: true, startDate: true, endDate: true },
  })
  const oids = [...new Set(entries.map(e => e.studentOid))]
  const students = await prisma.student.findMany({
    where: { externalId: { in: oids }, isActive: true },
    select: {
      id: true,
      externalId: true,
      groupId: true,
      classMemberships: { where: { classId }, select: { schoolYearId: true } },
    },
  })
  const studentByOid = new Map(students.map(s => [s.externalId!, s]))

  const memo = <T>() => new Map<string, Promise<T>>()
  const planMemo = memo<number | null>()
  const groupMemo = memo<Map<number, number>>()
  const daysMemo = memo<Set<string>>()
  const once = <T>(m: Map<string, Promise<T>>, key: string, fn: () => Promise<T>) => {
    let p = m.get(key)
    if (!p) m.set(key, (p = fn()))
    return p
  }

  const results: OnlineShellGradeResult[] = []
  for (const e of entries) {
    const res = (status: OnlineShellGradeResult['status'], existing?: number | null) =>
      results.push(
        existing === undefined
          ? { studentOid: e.studentOid, status }
          : { studentOid: e.studentOid, status, existing },
      )

    const date = /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? new Date(e.date + 'T00:00:00.000Z') : null
    if (
      !date ||
      Number.isNaN(date.getTime()) ||
      (e.period !== 'AM' && e.period !== 'PM') ||
      !ALLOWED_GRADES.includes(e.grade)
    ) {
      res('invalid')
      continue
    }

    const year = years.find(y => y.startDate <= date && date <= y.endDate)
    if (!year) {
      res('no_school_year')
      continue
    }

    const student = studentByOid.get(e.studentOid)
    if (!student?.classMemberships.some(m => m.schoolYearId === year.id)) {
      res('unknown_student')
      continue
    }

    // The plan the teacher has this class in on that weekday: the class's own
    // plan wins over a combined class spanning it.
    const weekday = date.getUTCDay()
    const planId = await once(planMemo, `${year.id}:${weekday}`, async () => {
      const rows = await prisma.teacherAssignment.findMany({
        where: {
          teacherId,
          classId: { in: planIds },
          schoolYearId: year.id,
          selectedWeekday: weekday,
        },
        select: { classId: true },
      })
      const ids = rows.map(r => r.classId)
      return ids.includes(classId) ? classId : (ids[0] ?? null)
    })
    if (planId == null) {
      res('not_teaching_day')
      continue
    }

    const dayGroups = await once(groupMemo, `${planId}:${year.id}:${weekday}`, () =>
      weekdayGroupMap({ classId: planId, schoolYearId: year.id, weekday }),
    )
    const groupId = dayGroups.size > 0 ? dayGroups.get(student.id) : student.groupId
    if (groupId == null || groupId <= 0) {
      res('no_group')
      continue
    }

    const days = await once(
      daysMemo,
      `${planId}:${groupId}:${year.id}:${weekday}`,
      async () =>
        new Set(
          (
            await teachingDaysFor({
              teacherId,
              classId: planId,
              groupId,
              schoolYearId: year.id,
              weekday,
            })
          ).map(d => `${d.date}-${d.period}`),
        ),
    )
    if (!days.has(`${e.date}-${e.period}`)) {
      res('not_teaching_day')
      continue
    }

    const key = {
      studentId: student.id,
      teacherId,
      classId,
      groupId,
      schoolYearId: year.id,
      date,
      period: e.period,
    }
    const existing = await prisma.notenEntry.findUnique({
      where: { studentId_teacherId_classId_groupId_schoolYearId_date_period: key },
      select: { [field]: true } as Record<OnlineShellGradeField, true>,
    })
    const current = (existing as Record<string, number | null> | null)?.[field] ?? null
    if (current === e.grade) {
      res('unchanged')
      continue
    }
    if (current != null && !overwrite) {
      res('exists', current)
      continue
    }

    await prisma.notenEntry.upsert({
      where: { studentId_teacherId_classId_groupId_schoolYearId_date_period: key },
      create: { ...key, [field]: e.grade },
      update: { [field]: e.grade },
    })
    res('written')
  }
  return results
}
