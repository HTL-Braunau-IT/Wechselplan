import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { resolveMemberClassIds } from '@/lib/combined-classes'
import { isSemester2 } from '@/lib/grades'
import { dayGradeValue } from '@/app/noten/_lib/summary'
import { roundHalf } from '@/app/noten/_lib/erfassen'
import { type NotenEntryRow } from '@/app/noten/_lib/types'
import { resolveWeights, type WeightConfig } from '@/lib/noten-weights'

/**
 * Notenliste suggestions for the Notensammler entry screen.
 *
 * Returns, per student, the term grade the signed-in teacher's day-by-day
 * Notenliste (`/noten`) implies for each semester — the number the
 * "Notenliste X · übernehmen" chip offers. It is the *pure* calculated value:
 * unlike `transfer-prefill` it never falls back to a stored Endnote, because the
 * point here is to suggest a mark for a student who has none yet.
 *
 * The derivation reuses the canonical weighting (`dayGradeValue`) and half-step
 * rounding (`roundHalf`) so it can never diverge from what the Noten grid shows.
 * A day with no marks contributes nothing; the term grade is the mean of the
 * non-null day grades, split into semesters by `SchoolYear.semesterChangeDate`.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // The suggestion is derived from Noten data, so it needs that feature — the
    // chip simply doesn't appear when Noten is off.
    if (!(await isFeatureEnabled('noten'))) {
      return NextResponse.json({ suggestions: {} })
    }

    const { searchParams } = new URL(request.url)
    const classIdParam = searchParams.get('classId')
    if (!classIdParam) {
      return NextResponse.json({ error: 'classId required' }, { status: 400 })
    }
    const classId = parseInt(classIdParam, 10)
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: 'Invalid classId' }, { status: 400 })
    }

    const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    // A teacher only ever gets their own Notenliste, and only for a class they
    // are assigned to — same gate every /api/noten route applies.
    const assignments = await prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id, classId, schoolYearId },
      select: { groupId: true },
    })
    if (assignments.length === 0) {
      return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
    }

    const schoolYear = await prisma.schoolYear.findUnique({
      where: { id: schoolYearId },
      select: { semesterChangeDate: true },
    })
    const semesterChangeDate = schoolYear?.semesterChangeDate
      ? schoolYear.semesterChangeDate instanceof Date
        ? schoolYear.semesterChangeDate.toISOString().slice(0, 10)
        : String(schoolYear.semesterChangeDate)
      : undefined

    // The roster of a combined class is the union of its member classes (students
    // never move). For a normal class this is just [classId].
    const memberIds = await resolveMemberClassIds(classId)
    const memberships = await prisma.classMembership.findMany({
      where: { classId: { in: memberIds }, schoolYearId },
      select: { studentId: true },
    })
    const studentIds = memberships.map(m => m.studentId)
    if (studentIds.length === 0) {
      return NextResponse.json({ suggestions: {} })
    }
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, groupId: true },
    })

    const [weightRows, weightClassRow, weightGlobalRow, entries] = await Promise.all([
      prisma.notenWeightConfig.findMany({
        where: { teacherId: teacher.id, classId, schoolYearId },
      }),
      prisma.notenWeightClassConfig.findUnique({
        where: { teacherId_classId_schoolYearId: { teacherId: teacher.id, classId, schoolYearId } },
      }),
      prisma.notenWeightGlobalConfig.findUnique({ where: { teacherId: teacher.id } }),
      prisma.notenEntry.findMany({
        where: { teacherId: teacher.id, classId, schoolYearId },
      }),
    ])

    // Each group's own override, if any; the class and global defaults below fill
    // in for groups without one (a group row may have been collapsed into the
    // class default). Resolution matches the Noten grid via resolveWeights.
    const weightByGroup = new Map<number, WeightConfig>()
    for (const row of weightRows) {
      weightByGroup.set(row.groupId, {
        weightWiederholung: row.weightWiederholung,
        weightBericht: row.weightBericht,
        weightMitarbeit: row.weightMitarbeit,
        weightPraktischeArbeit: row.weightPraktischeArbeit,
      })
    }

    const entriesByStudent = new Map<number, NotenEntryRow[]>()
    for (const e of entries) {
      const dateStr = e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date)
      const list = entriesByStudent.get(e.studentId) ?? []
      list.push({
        studentId: e.studentId,
        date: dateStr,
        period: e.period,
        attendance: e.attendance,
        wiederholung1: e.wiederholung1,
        wiederholung2: e.wiederholung2,
        bericht1: e.bericht1,
        bericht2: e.bericht2,
        mitarbeit1: e.mitarbeit1,
        mitarbeit2: e.mitarbeit2,
        praktischeArbeit1: e.praktischeArbeit1,
        praktischeArbeit2: e.praktischeArbeit2,
        notizen: e.notizen,
      })
      entriesByStudent.set(e.studentId, list)
    }

    const suggestions: Record<number, { first: number | null; second: number | null }> = {}
    for (const student of students) {
      const list = entriesByStudent.get(student.id)
      if (!list || list.length === 0) continue

      const weights = resolveWeights({
        group: student.groupId != null ? weightByGroup.get(student.groupId) : null,
        class: weightClassRow,
        global: weightGlobalRow,
      })

      const firstDays: number[] = []
      const secondDays: number[] = []
      for (const entry of list) {
        const dayGrade = dayGradeValue(entry, weights)
        if (dayGrade == null) continue
        if (isSemester2(entry.date, semesterChangeDate)) secondDays.push(dayGrade)
        else firstDays.push(dayGrade)
      }

      const mean = (values: number[]): number | null =>
        values.length > 0 ? roundHalf(values.reduce((a, b) => a + b, 0) / values.length) : null

      const first = mean(firstDays)
      const second = mean(secondDays)
      if (first != null || second != null) suggestions[student.id] = { first, second }
    }

    return NextResponse.json({ suggestions })
  } catch (error) {
    captureError(error as Error, {
      location: 'api/notensammler/notenliste-suggestions',
      type: 'notenliste-suggestions',
    })
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 })
  }
}
