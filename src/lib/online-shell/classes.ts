import { prisma } from '@/lib/prisma'
import { resolveMemberClassIds } from '@/lib/combined-classes'
import { weekdayGroupMap } from '@/lib/weekday-groups'
import { teachingDaysFor } from '@/lib/teaching-days'

/**
 * What Online-Shell needs to mirror a teacher's classes: every real class the
 * teacher teaches this school year (a combined class is expanded into its
 * member classes, since Online-Shell classes are M365 groups = real classes),
 * and for each weekday the teacher has the class, the groups of that day's plan
 * with their students and the teacher's teaching days for each group.
 *
 * Students are identified by their Entra object id (`Student.externalId`) —
 * the same id Online-Shell stores as `User.entraOid` — plus e-mail as a hint.
 */

export type OnlineShellStudent = {
  oid: string | null
  email: string | null
  firstName: string
  lastName: string
}

export type OnlineShellGroup = {
  groupId: number
  students: Array<{ oid: string | null; email: string | null }>
  teachingDays: Array<{ date: string; period: string }>
}

export type OnlineShellDay = {
  /** 0 = Sunday, 1 = Monday, … (Schedule.selectedWeekday) */
  weekday: number
  /** The class that owns the plan: the class itself or a combined class spanning it. */
  planClassId: number
  planClassName: string
  groups: OnlineShellGroup[]
}

export type OnlineShellClass = {
  id: number
  name: string
  /** Entra group id (null for classes not synced from Entra). */
  externalId: string | null
  students: OnlineShellStudent[]
  days: OnlineShellDay[]
}

export async function teacherClassesForOnlineShell(params: {
  teacherId: number
  schoolYearId: number
}): Promise<OnlineShellClass[]> {
  const { teacherId, schoolYearId } = params

  const assignments = await prisma.teacherAssignment.findMany({
    where: { teacherId, schoolYearId },
    select: { classId: true, selectedWeekday: true },
  })
  // plan class → weekdays the teacher has it
  const planDays = new Map<number, Set<number>>()
  for (const a of assignments) {
    planDays.set(a.classId, (planDays.get(a.classId) ?? new Set()).add(a.selectedWeekday))
  }
  if (planDays.size === 0) return []

  // plan class → its real classes
  const membersOfPlan = new Map<number, number[]>()
  for (const planId of planDays.keys()) {
    membersOfPlan.set(planId, await resolveMemberClassIds(planId))
  }
  const realIds = [...new Set([...membersOfPlan.values()].flat())]
  const planIds = [...planDays.keys()]

  const [classes, memberships] = await Promise.all([
    prisma.class.findMany({
      where: { id: { in: [...new Set([...realIds, ...planIds])] } },
      select: { id: true, name: true, externalId: true, isActive: true },
    }),
    prisma.classMembership.findMany({
      where: { classId: { in: realIds }, schoolYearId, student: { isActive: true } },
      select: {
        classId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            externalId: true,
            groupId: true,
          },
        },
      },
    }),
  ])
  const classById = new Map(classes.map(c => [c.id, c]))
  const rosterOf = new Map<number, (typeof memberships)[number]['student'][]>()
  for (const m of memberships) {
    rosterOf.set(m.classId, [...(rosterOf.get(m.classId) ?? []), m.student])
  }

  const result = new Map<number, OnlineShellClass>()
  for (const realId of realIds) {
    const cls = classById.get(realId)
    if (!cls?.isActive) continue
    const roster = (rosterOf.get(realId) ?? []).sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'),
    )
    result.set(realId, {
      id: cls.id,
      name: cls.name,
      externalId: cls.externalId,
      students: roster.map(s => ({
        oid: s.externalId,
        email: s.email,
        firstName: s.firstName,
        lastName: s.lastName,
      })),
      days: [],
    })
  }

  for (const [planId, weekdays] of planDays) {
    const planName = classById.get(planId)?.name ?? ''
    for (const weekday of [...weekdays].sort((a, b) => a - b)) {
      const dayGroups = await weekdayGroupMap({ classId: planId, schoolYearId, weekday })
      for (const realId of membersOfPlan.get(planId) ?? []) {
        const out = result.get(realId)
        if (!out) continue
        const byGroup = new Map<number, Array<{ oid: string | null; email: string | null }>>()
        for (const s of rosterOf.get(realId) ?? []) {
          // Stored per-day rows are authoritative; without any, Student.groupId.
          const g = dayGroups.size > 0 ? dayGroups.get(s.id) : s.groupId
          if (g == null || g <= 0) continue
          byGroup.set(g, [...(byGroup.get(g) ?? []), { oid: s.externalId, email: s.email }])
        }
        const groups: OnlineShellGroup[] = []
        for (const groupId of [...byGroup.keys()].sort((a, b) => a - b)) {
          const days = await teachingDaysFor({
            teacherId,
            classId: planId,
            groupId,
            schoolYearId,
            weekday,
          })
          groups.push({
            groupId,
            students: byGroup.get(groupId) ?? [],
            teachingDays: days.map(d => ({ date: d.date, period: d.period })),
          })
        }
        out.days.push({ weekday, planClassId: planId, planClassName: planName, groups })
      }
    }
  }

  return [...result.values()]
    .map(c => ({ ...c, days: c.days.sort((a, b) => a.weekday - b.weekday) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}
