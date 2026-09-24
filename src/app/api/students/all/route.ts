import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'

export interface WeekdayGroupEntry {
  weekday: number
  groupId: number
  /** The plan's class when it differs from the student's own (a combined class). */
  planClassName: string | null
}

/**
 * Each student's group per weekday in a school year (groups are per weekday).
 * Sorted by weekday; a student without per-day rows maps to an empty list.
 */
async function weekdayGroupsByStudent(
  studentIds: number[],
  schoolYearId: number | null,
): Promise<Map<number, Array<WeekdayGroupEntry & { planClassId: number }>>> {
  const byStudent = new Map<number, Array<WeekdayGroupEntry & { planClassId: number }>>()
  if (schoolYearId == null || studentIds.length === 0) return byStudent
  const rows = await prisma.studentWeekdayGroup.findMany({
    where: { studentId: { in: studentIds }, schoolYearId },
    select: { studentId: true, classId: true, selectedWeekday: true, groupId: true },
    orderBy: [{ selectedWeekday: 'asc' }, { classId: 'asc' }],
  })
  const classes = await prisma.class.findMany({
    where: { id: { in: [...new Set(rows.map(r => r.classId))] } },
    select: { id: true, name: true },
  })
  const nameById = new Map(classes.map(c => [c.id, c.name]))
  for (const r of rows) {
    const list = byStudent.get(r.studentId) ?? []
    list.push({
      weekday: r.selectedWeekday,
      groupId: r.groupId,
      planClassId: r.classId,
      planClassName: nameById.get(r.classId) ?? null,
    })
    byStudent.set(r.studentId, list)
  }
  return byStudent
}

/** Attach `weekdayGroups`, naming the plan class only when it is not the student's own. */
function withWeekdayGroups<T extends { id: number; classId: number | null }>(
  students: T[],
  byStudent: Awaited<ReturnType<typeof weekdayGroupsByStudent>>,
): Array<T & { weekdayGroups: WeekdayGroupEntry[] }> {
  return students.map(s => ({
    ...s,
    weekdayGroups: (byStudent.get(s.id) ?? []).map(({ planClassId, ...entry }) => ({
      ...entry,
      planClassName: planClassId === s.classId ? null : entry.planClassName,
    })),
  }))
}

/**
 * Handles GET requests to retrieve student records.
 * When schoolYearId is provided, returns only students that have a ClassMembership for that year (with classId from that membership).
 * Otherwise returns all students ordered by last name and first name.
 *
 * @returns A JSON response containing the list of students, or an error message with status 500 if the query fails.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const schoolYearIdParam = searchParams.get('schoolYearId')
    const schoolYearId = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined

    if (schoolYearId != null && !Number.isNaN(schoolYearId)) {
      const memberships = await prisma.classMembership.findMany({
        where: { schoolYearId },
        include: {
          student: true,
          class: { select: { id: true, name: true } },
        },
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      })
      const students = memberships.map(m => ({
        ...m.student,
        classId: m.classId,
        class: m.class,
      }))
      const groups = await weekdayGroupsByStudent(
        students.map(s => s.id),
        schoolYearId,
      )
      return NextResponse.json(withWeekdayGroups(students, groups))
    }

    const students = await prisma.student.findMany({
      include: { class: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    const groups = await weekdayGroupsByStudent(
      students.map(s => s.id),
      await resolveSchoolYearId(),
    )
    return NextResponse.json(withWeekdayGroups(students, groups))
  } catch (error) {
    captureError(error, {
      location: 'api/students/all',
      type: 'fetch-students',
    })
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }
}
