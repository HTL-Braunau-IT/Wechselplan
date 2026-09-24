import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { resolveMemberClassIds, resolveGradeClassIds } from '@/lib/combined-classes'
import { gradeGroupDay, overlayWeekdayGroups, teacherWeekdaysForClass } from '@/lib/weekday-groups'

/**
 * POST: Set Anwesenheit for all students in the group for the given day to "Anwesend".
 * Body: { classId, groupId, schoolYearId, date, period }
 */
export async function POST(request: Request) {
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

    const body = await request.json()
    const { classId, groupId, schoolYearId, date, period } = body as {
      classId?: number
      groupId?: number
      schoolYearId?: number
      date?: string
      period?: string
    }

    if (classId == null || groupId == null || schoolYearId == null || !date || !period) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (period !== 'AM' && period !== 'PM') {
      return NextResponse.json({ error: 'period must be AM or PM' }, { status: 400 })
    }
    // Require a strict YYYY-MM-DD string and round-trip it so overflow dates
    // like 2025-02-31 (which Date silently rolls into March) are rejected
    // rather than persisted under the wrong @db.Date.
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    }
    // Anchor at UTC midnight, exactly as the per-cell entries route does. Using
    // local midnight here shifted the @db.Date to the previous day on servers
    // ahead of UTC (e.g. Austria), so "Alle anwesend" landed on the wrong day.
    const dateOnly = new Date(date + 'T00:00:00.000Z')
    if (Number.isNaN(dateOnly.getTime()) || dateOnly.toISOString().slice(0, 10) !== date) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
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

    // A combined class has no roster of its own — its students live in the member
    // classes. Expand to the member ids for the roster read; for a normal class
    // this is just [classId].
    const memberClassIds = await resolveMemberClassIds(classId)
    const membershipIds = await prisma.classMembership.findMany({
      where: { classId: { in: memberClassIds }, schoolYearId },
      select: { studentId: true },
    })
    const studentIds = membershipIds.map(m => m.studentId)
    const roster = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, groupId: true },
    })
    // Groups are per weekday: the group on the attendance date's weekday when the
    // teacher teaches the class that day, otherwise their usual day's grouping.
    const dateWeekday = dateOnly.getUTCDay()
    const teachingDays = await teacherWeekdaysForClass({
      classId,
      schoolYearId,
      teacherId: teacher.id,
    })
    const groupDay = await gradeGroupDay({
      classId,
      schoolYearId,
      teacherId: teacher.id,
      weekday: teachingDays.includes(dateWeekday) ? dateWeekday : null,
    })
    const studentsInGroup = (await overlayWeekdayGroups(roster, groupDay)).filter(
      s => s.groupId === groupId,
    )

    // The attendance NotenEntry is filed under each student's real (Zeugnis) class,
    // never the combined lens. For a normal class every student maps to classId.
    const gradeClassMap = await resolveGradeClassIds(
      classId,
      schoolYearId,
      studentsInGroup.map(s => s.id),
    )

    // One transaction so a mid-loop failure doesn't leave the day half-marked.
    await prisma.$transaction(
      studentsInGroup
        .map(s => {
          const effectiveClassId = gradeClassMap.get(s.id)
          if (effectiveClassId == null) return null
          return prisma.notenEntry.upsert({
            where: {
              studentId_teacherId_classId_groupId_schoolYearId_date_period: {
                studentId: s.id,
                teacherId: teacher.id,
                classId: effectiveClassId,
                groupId,
                schoolYearId,
                date: dateOnly,
                period,
              },
            },
            create: {
              studentId: s.id,
              teacherId: teacher.id,
              classId: effectiveClassId,
              groupId,
              schoolYearId,
              date: dateOnly,
              period,
              attendance: 'Anwesend',
            },
            update: { attendance: 'Anwesend' },
          })
        })
        .filter((op): op is NonNullable<typeof op> => op != null),
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/set-attendance-day',
      type: 'set-attendance-day',
    })
    return NextResponse.json({ error: 'Failed to set attendance' }, { status: 500 })
  }
}
