import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'

/**
 * GET: Returns classes the current teacher is assigned to, each with all group IDs for that class
 * (from any teacher's assignment in the school year). Used for class and group tabs on the Noten page.
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
    const schoolYearIdParam = searchParams.get('schoolYearId')
    const schoolYearId = await resolveSchoolYearId(schoolYearIdParam)
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const teacher = await resolveSessionTeacher(session)

    if (!teacher) {
      return NextResponse.json({ classes: [] })
    }

    const myAssignments = await prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id, schoolYearId },
      select: { classId: true, selectedWeekday: true },
    })
    const classIds = [...new Set(myAssignments.map(a => a.classId))]
    if (classIds.length === 0) {
      return NextResponse.json({ classes: [] })
    }

    // All groups for these classes (from any teacher's assignment), so the UI can show all group tabs
    const allAssignments = await prisma.teacherAssignment.findMany({
      where: { classId: { in: classIds }, schoolYearId },
      select: { classId: true, groupId: true, selectedWeekday: true },
    })
    const byClass = new Map<number, Set<number>>()
    // Groups are per weekday, so the group tabs are too: a class split into two
    // groups on Monday and three on Thursday offers the tabs of the chosen day.
    const byClassDay = new Map<number, Map<number, Set<number>>>()
    for (const a of allAssignments) {
      if (!byClass.has(a.classId)) byClass.set(a.classId, new Set())
      byClass.get(a.classId)!.add(a.groupId)
      const days = byClassDay.get(a.classId) ?? new Map<number, Set<number>>()
      days.set(a.selectedWeekday, (days.get(a.selectedWeekday) ?? new Set()).add(a.groupId))
      byClassDay.set(a.classId, days)
    }
    // The days THIS teacher teaches each class — the day switch's options.
    const myDaysByClass = new Map<number, Set<number>>()
    for (const a of myAssignments) {
      myDaysByClass.set(
        a.classId,
        (myDaysByClass.get(a.classId) ?? new Set()).add(a.selectedWeekday),
      )
    }
    const sorted = (set: Set<number> | undefined) => Array.from(set ?? []).sort((a, b) => a - b)

    const classRecords = await prisma.class.findMany({
      where: { id: { in: classIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    const classes = classRecords.map(cls => {
      const weekdays = sorted(myDaysByClass.get(cls.id))
      const days = byClassDay.get(cls.id)
      return {
        id: cls.id,
        name: cls.name,
        groupIds: sorted(byClass.get(cls.id)),
        weekdays,
        groupIdsByWeekday: Object.fromEntries(weekdays.map(day => [day, sorted(days?.get(day))])),
      }
    })

    return NextResponse.json({ classes })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/teacher-classes',
      type: 'fetch-teacher-classes',
    })
    return NextResponse.json({ error: 'Failed to fetch teacher classes' }, { status: 500 })
  }
}
