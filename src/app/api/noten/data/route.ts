import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { toLocalDateString } from '@/lib/date-utils'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { resolveMemberClassIds } from '@/lib/combined-classes'
import { type WeightConfig } from '@/lib/noten-weights'

function dateToLocalString(d: Date | string): string {
  return d instanceof Date ? toLocalDateString(d) : String(d)
}

/** Pull just the four weight fields off a stored row, or null when absent. */
function toWeightConfig(
  row: {
    weightWiederholung: number
    weightBericht: number
    weightMitarbeit: number
    weightPraktischeArbeit: number
  } | null,
): WeightConfig | null {
  return row
    ? {
        weightWiederholung: row.weightWiederholung,
        weightBericht: row.weightBericht,
        weightMitarbeit: row.weightMitarbeit,
        weightPraktischeArbeit: row.weightPraktischeArbeit,
      }
    : null
}

/**
 * GET: Returns weight config, Lehrstoff per day, and all NotenEntry rows for (teacher, class, group, school year).
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

    const schoolYearId = await resolveSchoolYearId(schoolYearIdParam)
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

    const notensammlerEnabled = await isFeatureEnabled('notensammler')

    // Entries and grades of a combined class are filed under its member classes
    // (each student's real class), so read them across the union. The teacher's
    // weight config and Lehrstoff are per teaching context and stay keyed to the
    // (possibly combined) class the teacher is working.
    const gradeClassIds = await resolveMemberClassIds(classId)

    const [weightGroup, weightClass, weightGlobal, lehrstoffRows, entries, gradeRows, finalGradeRows] =
      await Promise.all([
        prisma.notenWeightConfig.findUnique({
          where: {
            teacherId_classId_groupId_schoolYearId: {
              teacherId: teacher.id,
              classId,
              groupId,
              schoolYearId,
            },
          },
        }),
        prisma.notenWeightClassConfig.findUnique({
          where: {
            teacherId_classId_schoolYearId: { teacherId: teacher.id, classId, schoolYearId },
          },
        }),
        prisma.notenWeightGlobalConfig.findUnique({ where: { teacherId: teacher.id } }),
        prisma.lehrstoffPerDay.findMany({
        where: { teacherId: teacher.id, classId, groupId, schoolYearId },
      }),
      prisma.notenEntry.findMany({
        where: { teacherId: teacher.id, classId: { in: gradeClassIds }, groupId, schoolYearId },
      }),
      notensammlerEnabled
        ? prisma.grade.findMany({
            where: { teacherId: teacher.id, classId: { in: gradeClassIds }, schoolYearId },
            select: { studentId: true, semester: true, grade: true },
          })
        : Promise.resolve([]),
      prisma.finalGrade.findMany({
        where: { classId: { in: gradeClassIds }, schoolYearId },
        select: { studentId: true, semester: true, grade: true, conductNoteWish: true },
      }),
    ])

    const lehrstoffByDay: Record<string, string> = {}
    for (const row of lehrstoffRows) {
      const dateKey = `${dateToLocalString(row.date)}-${row.period}`
      lehrstoffByDay[dateKey] = row.lehrstoff ?? ''
    }

    const finalGrades: Record<
      number,
      {
        first: { grade: number | null; conductNoteWish: string | null }
        second: { grade: number | null; conductNoteWish: string | null }
      }
    > = {}
    for (const row of finalGradeRows) {
      finalGrades[row.studentId] ??= {
        first: { grade: null, conductNoteWish: null },
        second: { grade: null, conductNoteWish: null },
      }
      if (row.semester === 'first') {
        finalGrades[row.studentId]!.first = {
          grade: notensammlerEnabled ? null : row.grade,
          conductNoteWish: row.conductNoteWish ?? null,
        }
      } else if (row.semester === 'second') {
        finalGrades[row.studentId]!.second = {
          grade: notensammlerEnabled ? null : row.grade,
          conductNoteWish: row.conductNoteWish ?? null,
        }
      }
    }
    if (notensammlerEnabled) {
      for (const row of gradeRows) {
        finalGrades[row.studentId] ??= {
          first: { grade: null, conductNoteWish: null },
          second: { grade: null, conductNoteWish: null },
        }
        if (row.semester === 'first') {
          finalGrades[row.studentId]!.first = {
            ...finalGrades[row.studentId]!.first,
            grade: row.grade,
          }
        } else if (row.semester === 'second') {
          finalGrades[row.studentId]!.second = {
            ...finalGrades[row.studentId]!.second,
            grade: row.grade,
          }
        }
      }
    }

    return NextResponse.json({
      // The three raw override levels for this (teacher, class, group); the
      // client resolves the effective split (group → class → global → default)
      // via resolveWeights so it can also show what is set at each level.
      weights: {
        group: toWeightConfig(weightGroup),
        class: toWeightConfig(weightClass),
        global: toWeightConfig(weightGlobal),
      },
      lehrstoffByDay,
      finalGrades,
      ...(notensammlerEnabled ? { teacherId: teacher.id } : {}),
      entries: entries.map(e => ({
        studentId: e.studentId,
        date: dateToLocalString(e.date),
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
      })),
    })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/data',
      type: 'fetch-data',
    })
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}
