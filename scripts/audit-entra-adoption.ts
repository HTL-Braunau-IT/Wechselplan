/**
 * Read-only audit: which active rows has Entra sync never adopted?
 *
 * This is the gate for turning LDAP off. A Student/Teacher/Class row whose
 * `externalSource` is not `entra` was never matched by a sync run, so nothing
 * in Entra keeps it up to date. After cutover it is frozen: it will never be
 * renamed, moved between classes, or deactivated again, and — because sync only
 * ever deactivates rows it owns — it will not even be reported as stale.
 *
 * Run with:
 *   npm run db:audit-entra-adoption
 *
 * Exit codes are meaningful so this can gate a deployment:
 *   0 — every active row is adopted, safe to disable LDAP
 *   1 — unadopted rows exist, listed on stdout
 *   2 — the audit itself failed
 */
import { PrismaClient } from '@prisma/client'

const EXTERNAL_SOURCE_ENTRA = 'entra'

const prisma = new PrismaClient()

interface UnadoptedRow {
  id: number
  label: string
  username?: string
  className?: string | null
  externalId: string | null
  externalSource: string | null
  /** Rows that would be orphaned along with this one. */
  dependents?: Record<string, number>
}

interface ScopeReport {
  activeTotal: number
  adopted: number
  unadopted: UnadoptedRow[]
}

/**
 * `isActive: ANY_ACTIVE_STATE` is not needed here: this script uses a raw
 * PrismaClient without the active-by-default extension, so `isActive` is
 * filtered explicitly and nothing is hidden.
 */
async function auditTeachers(): Promise<ScopeReport> {
  const rows = await prisma.teacher.findMany({
    where: { isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      externalId: true,
      externalSource: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const unadopted: UnadoptedRow[] = []
  for (const row of rows) {
    if (row.externalSource === EXTERNAL_SOURCE_ENTRA && row.externalId) continue

    const [assignments, grades, headClasses, leadClasses] = await Promise.all([
      prisma.teacherAssignment.count({ where: { teacherId: row.id } }),
      prisma.grade.count({ where: { teacherId: row.id } }),
      prisma.class.count({ where: { classHeadId: row.id } }),
      prisma.class.count({ where: { classLeadId: row.id } }),
    ])

    unadopted.push({
      id: row.id,
      label: `${row.lastName}, ${row.firstName}`,
      username: row.username,
      externalId: row.externalId,
      externalSource: row.externalSource,
      dependents: { assignments, grades, headClasses, leadClasses },
    })
  }

  return { activeTotal: rows.length, adopted: rows.length - unadopted.length, unadopted }
}

async function auditStudents(): Promise<ScopeReport> {
  const rows = await prisma.student.findMany({
    where: { isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      externalId: true,
      externalSource: true,
      class: { select: { name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  const unadopted: UnadoptedRow[] = []
  for (const row of rows) {
    if (row.externalSource === EXTERNAL_SOURCE_ENTRA && row.externalId) continue

    const [grades, finalGrades, notenEntries, memberships] = await Promise.all([
      prisma.grade.count({ where: { studentId: row.id } }),
      prisma.finalGrade.count({ where: { studentId: row.id } }),
      prisma.notenEntry.count({ where: { studentId: row.id } }),
      prisma.classMembership.count({ where: { studentId: row.id } }),
    ])

    unadopted.push({
      id: row.id,
      label: `${row.lastName}, ${row.firstName}`,
      username: row.username,
      className: row.class?.name ?? null,
      externalId: row.externalId,
      externalSource: row.externalSource,
      dependents: { grades, finalGrades, notenEntries, memberships },
    })
  }

  return { activeTotal: rows.length, adopted: rows.length - unadopted.length, unadopted }
}

async function auditClasses(): Promise<ScopeReport> {
  const rows = await prisma.class.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      externalId: true,
      externalSource: true,
    },
    orderBy: { name: 'asc' },
  })

  const unadopted: UnadoptedRow[] = []
  for (const row of rows) {
    if (row.externalSource === EXTERNAL_SOURCE_ENTRA && row.externalId) continue

    const [students, schedules, assignments, groupAssignments] = await Promise.all([
      prisma.student.count({ where: { classId: row.id, isActive: true } }),
      prisma.schedule.count({ where: { classId: row.id } }),
      prisma.teacherAssignment.count({ where: { classId: row.id } }),
      prisma.groupAssignment.count({ where: { class: row.name } }),
    ])

    unadopted.push({
      id: row.id,
      label: row.name,
      externalId: row.externalId,
      externalSource: row.externalSource,
      dependents: { students, schedules, assignments, groupAssignments },
    })
  }

  return { activeTotal: rows.length, adopted: rows.length - unadopted.length, unadopted }
}

/**
 * Rotation groups are keyed by class *name*, so a `GroupAssignment` row whose
 * name matches no active class is dangling — usually the residue of a class
 * rename that predates the migration in `class-student-sync`.
 */
async function auditOrphanedGroupAssignments() {
  const [groupAssignments, classNames] = await Promise.all([
    prisma.groupAssignment.findMany({ select: { id: true, class: true, groupId: true } }),
    prisma.class.findMany({ where: { isActive: true }, select: { name: true } }),
  ])

  const activeNames = new Set(classNames.map(c => c.name))
  return groupAssignments.filter(ga => !activeNames.has(ga.class))
}

async function main() {
  const [teachers, students, classes, orphanedGroups] = await Promise.all([
    auditTeachers(),
    auditStudents(),
    auditClasses(),
    auditOrphanedGroupAssignments(),
  ])

  const report = {
    auditedAt: new Date().toISOString(),
    teachers,
    students,
    classes,
    orphanedGroupAssignments: orphanedGroups,
    ready:
      teachers.unadopted.length === 0 &&
      students.unadopted.length === 0 &&
      classes.unadopted.length === 0,
  }

  console.log(JSON.stringify(report, null, 2))

  const unadoptedTotal =
    teachers.unadopted.length + students.unadopted.length + classes.unadopted.length

  console.error(
    report.ready
      ? `\nAll ${teachers.activeTotal + students.activeTotal + classes.activeTotal} active rows are adopted by Entra sync. Safe to disable LDAP.`
      : `\n${unadoptedTotal} active row(s) are not adopted by Entra sync. Resolve these before disabling LDAP.`,
  )
  if (orphanedGroups.length > 0) {
    console.error(
      `${orphanedGroups.length} GroupAssignment row(s) reference a class name that no active class holds.`,
    )
  }

  return report.ready ? 0 : 1
}

main()
  .then(async code => {
    await prisma.$disconnect()
    process.exit(code)
  })
  .catch(async error => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(2)
  })
