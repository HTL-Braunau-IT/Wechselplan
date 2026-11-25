import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { resolveMemberClassIds } from '@/lib/combined-classes'
import { entryWeekday, recordedClassDays } from '@/lib/noten-access'

/**
 * GET: Returns classes the current teacher is assigned to, each with all group IDs for that class
 * (from any teacher's assignment in the school year). Used for class and group tabs on the Noten page.
 *
 * Classes and weekdays the teacher was taken off the plan for are still listed when they
 * recorded marks there (`formerWeekdays`), so those marks stay viewable — see src/lib/noten-access.ts.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const assignedClassIds = [...new Set(myAssignments.map(a => a.classId))]
    // The days THIS teacher teaches each class — the day switch's options.
    const myDaysByClass = new Map<number, Set<number>>()
    for (const a of myAssignments) {
      myDaysByClass.set(
        a.classId,
        (myDaysByClass.get(a.classId) ?? new Set()).add(a.selectedWeekday),
      )
    }

    // What the teacher recorded on days they are no longer on the plan for.
    // Entries are filed under the student's real class, so an assigned combined
    // class covers its members: real class id → the assigned classes showing it.
    const lensesByRealClass = new Map<number, number[]>()
    for (const id of assignedClassIds) {
      for (const memberId of await resolveMemberClassIds(id)) {
        lensesByRealClass.set(memberId, [...(lensesByRealClass.get(memberId) ?? []), id])
      }
    }
    // class id → weekday → the groups recorded on it
    const formerByClass = new Map<number, Map<number, Set<number>>>()
    for (const row of await recordedClassDays({ teacherId: teacher.id, schoolYearId })) {
      const weekday = entryWeekday(row.date)
      const lenses = lensesByRealClass.get(row.classId) ?? []
      // Still taught on that weekday through some assigned class: a live day.
      if (lenses.some(id => myDaysByClass.get(id)?.has(weekday))) continue
      // Otherwise it shows under the assigned class(es) covering it, or — with
      // no assignment left at all — under the real class the entries sit in.
      for (const id of lenses.length > 0 ? lenses : [row.classId]) {
        const days = formerByClass.get(id) ?? new Map<number, Set<number>>()
        days.set(weekday, (days.get(weekday) ?? new Set()).add(row.groupId))
        formerByClass.set(id, days)
      }
    }

    const classIds = [...new Set([...assignedClassIds, ...formerByClass.keys()])]
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
    const sorted = (set: Set<number> | undefined) => Array.from(set ?? []).sort((a, b) => a - b)

    const classRecords = await prisma.class.findMany({
      where: { id: { in: classIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    const classes = classRecords.map(cls => {
      const former = formerByClass.get(cls.id)
      const formerWeekdays = sorted(new Set(former?.keys()))
      const liveWeekdays = sorted(myDaysByClass.get(cls.id))
      const weekdays = sorted(new Set([...liveWeekdays, ...formerWeekdays]))
      const days = byClassDay.get(cls.id)
      const formerGroups = new Set([...(former?.values() ?? [])].flatMap(set => [...set]))
      return {
        id: cls.id,
        name: cls.name,
        groupIds: sorted(new Set([...(byClass.get(cls.id) ?? []), ...formerGroups])),
        weekdays,
        // A former day offers the groups the teacher recorded marks for on it.
        groupIdsByWeekday: Object.fromEntries(
          weekdays.map(day => [day, sorted(former?.get(day) ?? days?.get(day))]),
        ),
        ...(formerWeekdays.length > 0 ? { formerWeekdays } : {}),
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
