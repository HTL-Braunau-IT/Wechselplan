/**
 * Transactional merge script for teacher identity consolidation (LDAP/O365).
 *
 * Default mode is dry-run. Use --apply to execute writes.
 *
 * Examples:
 *   npx tsx scripts/merge-teacher-identities.ts --canonical 12 --merge 34,56
 *   npx tsx scripts/merge-teacher-identities.ts --canonical 12 --merge 34 --apply --retire delete
 */
import { PrismaClient, type Prisma, type Teacher } from '@prisma/client'

type RetireMode = 'deactivate' | 'delete'

interface CliOptions {
  canonicalId: number
  mergeIds: number[]
  apply: boolean
  retireMode: RetireMode
}

interface MergeSummary {
  canonicalId: number
  mergedTeacherIds: number[]
  dryRun: boolean
  retireMode: RetireMode
  adoptedExternalIdFromTeacherId: number | null
  rewired: RewiredCounts
  deduped: DedupedCounts
  retired: number
  mapping: Array<{ oldTeacherId: number; canonicalTeacherId: number }>
}

interface RewiredCounts {
  teacherAssignments: number
  teacherRotations: number
  grades: number
  notenWeightConfigs: number
  lehrstoffPerDay: number
  notenEntries: number
  classHeadLinks: number
  classLeadLinks: number
}

interface DedupedCounts {
  teacherAssignments: number
  teacherRotations: number
  grades: number
  notenWeightConfigs: number
  lehrstoffPerDay: number
  notenEntries: number
}

class DryRunAbort extends Error {
  summary: MergeSummary

  constructor(summary: MergeSummary) {
    super('DRY_RUN_ABORT')
    this.summary = summary
  }
}

const prisma = new PrismaClient()

function parseIntArg(raw: string | undefined, name: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: "${raw ?? ''}"`)
  }
  return value
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token) continue
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      args.set(key, 'true')
    } else {
      args.set(key, next)
      i++
    }
  }

  const canonicalId = parseIntArg(args.get('canonical'), 'canonical')
  const mergeRaw = args.get('merge')
  if (!mergeRaw) {
    throw new Error('Missing --merge argument (comma-separated teacher IDs)')
  }

  const mergeIds = mergeRaw
    .split(',')
    .map((id) => parseIntArg(id.trim(), 'merge id'))
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .filter((id) => id !== canonicalId)

  if (mergeIds.length === 0) {
    throw new Error('No merge teacher IDs remain after parsing')
  }

  const retireModeRaw = (args.get('retire') ?? 'deactivate').trim().toLowerCase()
  if (retireModeRaw !== 'deactivate' && retireModeRaw !== 'delete') {
    throw new Error(`Invalid --retire mode "${retireModeRaw}" (use deactivate|delete)`)
  }

  return {
    canonicalId,
    mergeIds,
    apply: args.get('apply') === 'true',
    retireMode: retireModeRaw,
  }
}

function pickExternalIdentity(canonical: Teacher, mergeRows: Teacher[]): { sourceTeacherId: number; externalId: string; externalSource: string | null } | null {
  if (canonical.externalId) return null

  const preferred = mergeRows.find((row) => row.externalId && row.externalSource === 'entra')
    ?? mergeRows.find((row) => row.externalId)
  if (!preferred?.externalId) return null

  return {
    sourceTeacherId: preferred.id,
    externalId: preferred.externalId,
    externalSource: preferred.externalSource ?? null,
  }
}

async function rewireTeacherAssignments(
  tx: Prisma.TransactionClient,
  sourceTeacherId: number,
  canonicalTeacherId: number,
): Promise<{ rewired: number; deduped: number }> {
  const sourceRows = await tx.teacherAssignment.findMany({ where: { teacherId: sourceTeacherId } })
  let rewired = 0
  let deduped = 0

  for (const row of sourceRows) {
    const conflict = await tx.teacherAssignment.findFirst({
      where: {
        teacherId: canonicalTeacherId,
        classId: row.classId,
        period: row.period,
        groupId: row.groupId,
        schoolYearId: row.schoolYearId,
      },
      select: { id: true },
    })

    if (conflict) {
      await tx.teacherAssignment.delete({ where: { id: row.id } })
      deduped++
      continue
    }

    await tx.teacherAssignment.update({
      where: { id: row.id },
      data: { teacherId: canonicalTeacherId },
    })
    rewired++
  }

  return { rewired, deduped }
}

async function rewireTeacherRotation(
  tx: Prisma.TransactionClient,
  sourceTeacherId: number,
  canonicalTeacherId: number,
): Promise<{ rewired: number; deduped: number }> {
  const sourceRows = await tx.teacherRotation.findMany({ where: { teacherId: sourceTeacherId } })
  let rewired = 0
  let deduped = 0

  for (const row of sourceRows) {
    const conflict = await tx.teacherRotation.findFirst({
      where: {
        teacherId: canonicalTeacherId,
        classId: row.classId,
        groupId: row.groupId,
        turnId: row.turnId,
        period: row.period,
      },
      select: { id: true },
    })

    if (conflict) {
      await tx.teacherRotation.delete({ where: { id: row.id } })
      deduped++
      continue
    }

    await tx.teacherRotation.update({
      where: { id: row.id },
      data: { teacherId: canonicalTeacherId },
    })
    rewired++
  }

  return { rewired, deduped }
}

async function rewireGradeLikeTable<
  TRow extends { id: number; updatedAt: Date },
>(
  tx: Prisma.TransactionClient,
  sourceTeacherId: number,
  canonicalTeacherId: number,
  findMany: (teacherId: number) => Promise<TRow[]>,
  findConflict: (row: TRow, canonicalTeacherId: number) => Promise<TRow | null>,
  updateTeacher: (rowId: number, canonicalTeacherId: number) => Promise<void>,
  deleteRow: (rowId: number) => Promise<void>,
): Promise<{ rewired: number; deduped: number }> {
  const sourceRows = await findMany(sourceTeacherId)
  let rewired = 0
  let deduped = 0

  for (const row of sourceRows) {
    const conflict = await findConflict(row, canonicalTeacherId)
    if (!conflict) {
      await updateTeacher(row.id, canonicalTeacherId)
      rewired++
      continue
    }

    // Keep the most recently updated row to preserve latest data.
    if (row.updatedAt > conflict.updatedAt) {
      await deleteRow(conflict.id)
      await updateTeacher(row.id, canonicalTeacherId)
    } else {
      await deleteRow(row.id)
    }
    deduped++
  }

  return { rewired, deduped }
}

async function performMerge(tx: Prisma.TransactionClient, options: CliOptions): Promise<MergeSummary> {
  const canonical = await tx.teacher.findUnique({ where: { id: options.canonicalId } })
  if (!canonical) throw new Error(`Canonical teacher ${options.canonicalId} not found`)

  const mergeRows = await tx.teacher.findMany({
    where: { id: { in: options.mergeIds } },
    orderBy: { id: 'asc' },
  })
  if (mergeRows.length !== options.mergeIds.length) {
    const found = new Set(mergeRows.map((row) => row.id))
    const missing = options.mergeIds.filter((id) => !found.has(id))
    throw new Error(`Merge teacher IDs not found: ${missing.join(', ')}`)
  }

  const rewired: RewiredCounts = {
    teacherAssignments: 0,
    teacherRotations: 0,
    grades: 0,
    notenWeightConfigs: 0,
    lehrstoffPerDay: 0,
    notenEntries: 0,
    classHeadLinks: 0,
    classLeadLinks: 0,
  }
  const deduped: DedupedCounts = {
    teacherAssignments: 0,
    teacherRotations: 0,
    grades: 0,
    notenWeightConfigs: 0,
    lehrstoffPerDay: 0,
    notenEntries: 0,
  }

  const adoption = pickExternalIdentity(canonical, mergeRows)
  if (adoption) {
    await tx.teacher.update({
      where: { id: canonical.id },
      data: {
        externalId: adoption.externalId,
        externalSource: adoption.externalSource ?? 'entra',
      },
    })
  }

  for (const source of mergeRows) {
    const assignmentStats = await rewireTeacherAssignments(tx, source.id, canonical.id)
    rewired.teacherAssignments += assignmentStats.rewired
    deduped.teacherAssignments += assignmentStats.deduped

    const rotationStats = await rewireTeacherRotation(tx, source.id, canonical.id)
    rewired.teacherRotations += rotationStats.rewired
    deduped.teacherRotations += rotationStats.deduped

    const gradeStats = await rewireGradeLikeTable(
      tx,
      source.id,
      canonical.id,
      (teacherId) => tx.grade.findMany({ where: { teacherId } }),
      (row, teacherId) => tx.grade.findFirst({
        where: {
          teacherId,
          studentId: (row as unknown as { studentId: number }).studentId,
          classId: (row as unknown as { classId: number }).classId,
          semester: (row as unknown as { semester: 'first' | 'second' }).semester,
          schoolYearId: (row as unknown as { schoolYearId: number }).schoolYearId,
        },
      }),
      (id, teacherId) => tx.grade.update({ where: { id }, data: { teacherId } }).then(() => undefined),
      (id) => tx.grade.delete({ where: { id } }).then(() => undefined),
    )
    rewired.grades += gradeStats.rewired
    deduped.grades += gradeStats.deduped

    const weightStats = await rewireGradeLikeTable(
      tx,
      source.id,
      canonical.id,
      (teacherId) => tx.notenWeightConfig.findMany({ where: { teacherId } }),
      (row, teacherId) => tx.notenWeightConfig.findFirst({
        where: {
          teacherId,
          classId: (row as unknown as { classId: number }).classId,
          groupId: (row as unknown as { groupId: number }).groupId,
          schoolYearId: (row as unknown as { schoolYearId: number }).schoolYearId,
        },
      }),
      (id, teacherId) => tx.notenWeightConfig.update({ where: { id }, data: { teacherId } }).then(() => undefined),
      (id) => tx.notenWeightConfig.delete({ where: { id } }).then(() => undefined),
    )
    rewired.notenWeightConfigs += weightStats.rewired
    deduped.notenWeightConfigs += weightStats.deduped

    const lehrstoffStats = await rewireGradeLikeTable(
      tx,
      source.id,
      canonical.id,
      (teacherId) => tx.lehrstoffPerDay.findMany({ where: { teacherId } }),
      (row, teacherId) => tx.lehrstoffPerDay.findFirst({
        where: {
          teacherId,
          classId: (row as unknown as { classId: number }).classId,
          groupId: (row as unknown as { groupId: number }).groupId,
          schoolYearId: (row as unknown as { schoolYearId: number }).schoolYearId,
          date: (row as unknown as { date: Date }).date,
          period: (row as unknown as { period: 'AM' | 'PM' }).period,
        },
      }),
      (id, teacherId) => tx.lehrstoffPerDay.update({ where: { id }, data: { teacherId } }).then(() => undefined),
      (id) => tx.lehrstoffPerDay.delete({ where: { id } }).then(() => undefined),
    )
    rewired.lehrstoffPerDay += lehrstoffStats.rewired
    deduped.lehrstoffPerDay += lehrstoffStats.deduped

    const notenEntryStats = await rewireGradeLikeTable(
      tx,
      source.id,
      canonical.id,
      (teacherId) => tx.notenEntry.findMany({ where: { teacherId } }),
      (row, teacherId) => tx.notenEntry.findFirst({
        where: {
          teacherId,
          studentId: (row as unknown as { studentId: number }).studentId,
          classId: (row as unknown as { classId: number }).classId,
          groupId: (row as unknown as { groupId: number }).groupId,
          schoolYearId: (row as unknown as { schoolYearId: number }).schoolYearId,
          date: (row as unknown as { date: Date }).date,
          period: (row as unknown as { period: 'AM' | 'PM' }).period,
        },
      }),
      (id, teacherId) => tx.notenEntry.update({ where: { id }, data: { teacherId } }).then(() => undefined),
      (id) => tx.notenEntry.delete({ where: { id } }).then(() => undefined),
    )
    rewired.notenEntries += notenEntryStats.rewired
    deduped.notenEntries += notenEntryStats.deduped

    rewired.classHeadLinks += await tx.classYearStaff.updateMany({
      where: { classHeadId: source.id },
      data: { classHeadId: canonical.id },
    }).then((r) => r.count)
    rewired.classLeadLinks += await tx.classYearStaff.updateMany({
      where: { classLeadId: source.id },
      data: { classLeadId: canonical.id },
    }).then((r) => r.count)

    if (options.retireMode === 'delete') {
      await tx.teacher.delete({ where: { id: source.id } })
    } else {
      await tx.teacher.update({
        where: { id: source.id },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          externalId: null,
          externalSource: null,
          lastSyncedAt: new Date(),
        },
      })
    }
  }

  return {
    canonicalId: options.canonicalId,
    mergedTeacherIds: mergeRows.map((row) => row.id),
    dryRun: !options.apply,
    retireMode: options.retireMode,
    adoptedExternalIdFromTeacherId: adoption?.sourceTeacherId ?? null,
    rewired,
    deduped,
    retired: mergeRows.length,
    mapping: mergeRows.map((row) => ({ oldTeacherId: row.id, canonicalTeacherId: options.canonicalId })),
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!options.apply) {
    const preview = await prisma.$transaction(async (tx) => {
      const summary = await performMerge(tx, options)
      throw new DryRunAbort(summary)
    }).catch((error: unknown) => {
      if (error instanceof DryRunAbort) {
        return error.summary
      }
      throw error
    })

    console.log(JSON.stringify(preview, null, 2))
    return
  }

  const summary = await prisma.$transaction(async (tx) => performMerge(tx, options))
  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
