import type { Class, Prisma, Student } from '@prisma/client'
import { ANY_ACTIVE_STATE, prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { collectGroupMembers, getGroup, type EntraGroup, type EntraGroupMember } from '@/lib/graph'
import { getSyncedClassGroupIds, recordSyncRun } from '@/lib/directory-sync-settings'
import {
  mapMemberToEntraUser,
  type EntraUser,
  type EntraUserMappingIssue,
} from '@/lib/entra-user-mapper'
import { EXTERNAL_SOURCE_ENTRA } from '@/lib/teacher-sync'
import { assertDeactivationWithinLimit, resolveMaxDeactivationRatio } from '@/lib/sync-guard'

/**
 * ---- Public types ------------------------------------------------------------------------------
 */

export type ClassChange = 'name' | 'description'
export type StudentChange =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'username'
  | 'class'
  | 'sokratesId'

export interface ClassRowSummary {
  id: number
  name: string
  description: string | null
  externalId: string | null
  externalSource: string | null
  isActive: boolean
}

export interface StudentRowSummary {
  id: number
  firstName: string
  lastName: string
  username: string
  email: string | null
  classId: number | null
  className: string | null
  /** Rotation group within the current class, or null when unassigned. */
  groupId: number | null
  externalId: string | null
  externalSource: string | null
  sokratesId: string | null
  isActive: boolean
  syncStatus: string | null
}

export interface EntraClassGroup {
  id: string
  displayName: string
  description: string | null
}

export interface ClassSyncCreate {
  group: EntraClassGroup
}

export interface ClassSyncUpdate {
  existing: ClassRowSummary
  group: EntraClassGroup
  changes: ClassChange[]
  willAdopt: boolean
}

export interface ClassSyncDeactivate {
  existing: ClassRowSummary
}

export interface ClassSyncReactivate {
  existing: ClassRowSummary
  group: EntraClassGroup
  changes: ClassChange[]
}

export interface ClassSyncUnchanged {
  existing: ClassRowSummary
}

export interface StudentTargetClass {
  groupId: string
  groupDisplayName: string
}

export interface StudentSyncCreate {
  entra: EntraUser
  target: StudentTargetClass
}

/**
 * The class a student is moving to, and what that move costs them.
 *
 * Shared by the update and reactivate rows: a returning student can come back
 * into a different class than the one they left, and that clears their rotation
 * group for the same reason a live move does.
 */
export interface StudentClassChange {
  fromClassName: string | null
  toGroupDisplayName: string
  /**
   * The rotation group the student loses by moving. Groups are numbered per
   * class, so the number carries no meaning in the destination — see the
   * `studentUpdates` loop in `applyClassStudentSync`.
   */
  clearedGroupId: number | null
}

export interface StudentSyncUpdate {
  existing: StudentRowSummary
  entra: EntraUser
  changes: StudentChange[]
  willAdopt: boolean
  classChange: StudentClassChange | null
  target: StudentTargetClass
}

export interface StudentSyncDeactivate {
  existing: StudentRowSummary
}

export interface StudentSyncReactivate {
  existing: StudentRowSummary
  entra: EntraUser
  target: StudentTargetClass
  changes: StudentChange[]
  classChange: StudentClassChange | null
}

export interface StudentSyncUnchanged {
  existing: StudentRowSummary
}

/**
 * A student whose class cannot be determined because they belong to more than
 * one synced class group. They are recorded rather than skipped: skipping left
 * them invisible to sync, so they neither got a class nor were deactivated.
 */
export interface StudentSyncUnassigned {
  /** Null when the ambiguous user has no local row yet. */
  existing: StudentRowSummary | null
  entra: EntraUser
  groupDisplayNames: string[]
}

export interface ClassStudentSyncDiff {
  classes: {
    toCreate: ClassSyncCreate[]
    toUpdate: ClassSyncUpdate[]
    toDeactivate: ClassSyncDeactivate[]
    toReactivate: ClassSyncReactivate[]
    unchanged: ClassSyncUnchanged[]
  }
  students: {
    toCreate: StudentSyncCreate[]
    toUpdate: StudentSyncUpdate[]
    toDeactivate: StudentSyncDeactivate[]
    toReactivate: StudentSyncReactivate[]
    toMarkUnassigned: StudentSyncUnassigned[]
    unchanged: StudentSyncUnchanged[]
  }
  issues: EntraUserMappingIssue[]
  schoolYearId: number
  schoolYearLabel: string
  fetchedAt: string
  /** Entra group ids currently configured as synced class groups (snapshot). */
  syncedClassGroupIds: string[]
  /** Entra group ids that we could not fetch (e.g. deleted, forbidden). */
  unresolvedGroupIds: string[]
  debug: {
    resolvedGroupCount: number
    mappedGroupCount: number
    fetchedMemberCount: number
    mappedUserCount: number
    classRowCount: number
    studentRowCount: number
  }
}

export interface ClassStudentSyncSummary {
  classes: {
    created: number
    updated: number
    adopted: number
    deactivated: number
    reactivated: number
    unchanged: number
  }
  students: {
    created: number
    updated: number
    adopted: number
    deactivated: number
    reactivated: number
    unassigned: number
    unchanged: number
  }
  issues: EntraUserMappingIssue[]
  schoolYearId: number
  completedAt: string
}

export interface ClassStudentSyncSelection {
  classes?: {
    createGroupIds?: string[]
    updateGroupIds?: string[]
    reactivateGroupIds?: string[]
    deactivateClassIds?: number[]
  }
  students?: {
    createOids?: string[]
    updateOids?: string[]
    reactivateOids?: string[]
    unassignedOids?: string[]
    deactivateStudentIds?: number[]
  }
}

export interface ClassStudentSyncOptions {
  schoolYearId?: number
}

export interface ClassStudentSyncApplyOptions extends ClassStudentSyncOptions {
  /**
   * Refuse to apply when deactivations exceed this share of the currently
   * active rows. Guards against a Graph hiccup — an empty group response looks
   * exactly like "everyone left" — which matters most on the unattended
   * nightly path where no human reviews the preview first.
   *
   * Defaults to {@link DEFAULT_MAX_DEACTIVATION_RATIO}. Pass `null` to disable.
   */
  maxDeactivationRatio?: number | null
}

/**
 * ---- Helpers -----------------------------------------------------------------------------------
 */

async function resolveSchoolYearId(preferred?: number): Promise<{ id: number; label: string }> {
  if (preferred != null) {
    const year = await prisma.schoolYear.findUnique({
      where: { id: preferred },
      select: { id: true, label: true },
    })
    if (year) return year
  }

  const now = new Date()
  const current = await prisma.schoolYear.findFirst({
    where: { startDate: { lte: now }, endDate: { gte: now } },
    select: { id: true, label: true },
  })
  if (current) return current

  const latest = await prisma.schoolYear.findFirst({
    orderBy: { startDate: 'desc' },
    select: { id: true, label: true },
  })
  if (latest) return latest

  throw new Error(
    'No school year found. Create a school year in Admin / Data / School Years first.',
  )
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}

function toClassRowSummary(row: Class): ClassRowSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    externalId: row.externalId ?? null,
    externalSource: row.externalSource ?? null,
    isActive: row.isActive,
  }
}

function toStudentRowSummary(row: Student & { class: { name: string } | null }): StudentRowSummary {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    username: row.username,
    email: row.email ?? null,
    classId: row.classId ?? null,
    className: row.class?.name ?? null,
    groupId: row.groupId ?? null,
    externalId: row.externalId ?? null,
    externalSource: row.externalSource ?? null,
    sokratesId: row.sokratesId ?? null,
    isActive: row.isActive,
    syncStatus: row.syncStatus ?? null,
  }
}

function toEntraClassGroup(group: EntraGroup): EntraClassGroup | null {
  const displayName = group.displayName?.trim()
  if (!group.id || !displayName) return null
  return {
    id: group.id,
    displayName,
    description: group.description ?? null,
  }
}

function computeClassChanges(existing: ClassRowSummary, next: EntraClassGroup): ClassChange[] {
  const changes: ClassChange[] = []
  if (existing.name !== next.displayName) changes.push('name')
  if ((existing.description ?? null) !== (next.description ?? null)) changes.push('description')
  return changes
}

function computeStudentProfileChanges(
  existing: Pick<Student, 'firstName' | 'lastName' | 'email' | 'username' | 'sokratesId'>,
  next: EntraUser,
): Array<Exclude<StudentChange, 'class'>> {
  const changes: Array<Exclude<StudentChange, 'class'>> = []
  if (existing.firstName !== next.firstName) changes.push('firstName')
  if (existing.lastName !== next.lastName) changes.push('lastName')
  if ((existing.email ?? null) !== (next.email ?? null)) changes.push('email')
  if (existing.username !== next.username) changes.push('username')
  // Only flag when Entra actually carries a Sokrates id: a transient null from
  // Graph must not look like a change (and must not wipe a good stored value).
  if (next.sokratesId && (existing.sokratesId ?? null) !== next.sokratesId) {
    changes.push('sokratesId')
  }
  return changes
}

/**
 * ---- Preview -----------------------------------------------------------------------------------
 */

/**
 * Computes the diff between the current Class/Student tables and the members of
 * the configured Entra class groups. Performs no writes.
 */
export async function previewClassStudentSync(
  options: ClassStudentSyncOptions = {},
): Promise<ClassStudentSyncDiff> {
  const schoolYear = await resolveSchoolYearId(options.schoolYearId)
  const syncedClassGroupIds = await getSyncedClassGroupIds()

  const issues: EntraUserMappingIssue[] = []
  const entraGroups: EntraClassGroup[] = []
  const unresolvedGroupIds: string[] = []
  const membershipByOid = new Map<string, { user: EntraUser; groupIds: Set<string> }>()
  let fetchedMemberCount = 0

  // Fetch all synced groups + their members in parallel-ish (sequential Graph calls
  // would be safer re: rate-limits but we keep it simple for now).
  for (const groupId of syncedClassGroupIds) {
    let group: EntraGroup | null = null
    try {
      group = await getGroup(groupId)
    } catch (error) {
      captureError(error, {
        location: 'lib/class-student-sync',
        type: 'get_group_error',
        extra: { groupId },
      })
      unresolvedGroupIds.push(groupId)
      continue
    }
    if (!group) {
      unresolvedGroupIds.push(groupId)
      continue
    }

    const mapped = toEntraClassGroup(group)
    if (!mapped) {
      issues.push({
        oid: groupId,
        displayName: group.displayName ?? undefined,
        reason: 'Entra group has no usable displayName',
      })
      continue
    }
    entraGroups.push(mapped)

    let members: EntraGroupMember[] = []
    try {
      members = await collectGroupMembers(mapped.id, { transitive: true })
    } catch (error) {
      captureError(error, {
        location: 'lib/class-student-sync',
        type: 'collect_group_members_error',
        extra: { groupId: mapped.id },
      })
      issues.push({
        oid: mapped.id,
        displayName: mapped.displayName,
        reason: `Failed to list members for group "${mapped.displayName}"`,
      })
      continue
    }

    for (const member of members) {
      fetchedMemberCount += 1
      const mappedUser = mapMemberToEntraUser(member)
      if (mappedUser.issue) {
        issues.push(mappedUser.issue)
        continue
      }
      if (!mappedUser.user) continue

      const existing = membershipByOid.get(mappedUser.user.oid)
      if (existing) {
        existing.groupIds.add(mapped.id)
      } else {
        membershipByOid.set(mappedUser.user.oid, {
          user: mappedUser.user,
          groupIds: new Set([mapped.id]),
        })
      }
    }
  }

  /* ----- Class diff ----- */

  // Sync must see deactivated rows so it can reactivate people who reappear.
  const classRows = await prisma.class.findMany({ where: { isActive: ANY_ACTIVE_STATE } })
  const classByExternalId = new Map<string, Class>()
  const classByNormalizedName = new Map<string, Class>()
  for (const row of classRows) {
    if (row.externalId) classByExternalId.set(row.externalId, row)
    classByNormalizedName.set(normalizeName(row.name), row)
  }

  const matchedClassIds = new Set<number>()
  const classesToCreate: ClassSyncCreate[] = []
  const classesToUpdate: ClassSyncUpdate[] = []
  const classesToReactivate: ClassSyncReactivate[] = []
  const classesToDeactivate: ClassSyncDeactivate[] = []
  const classesUnchanged: ClassSyncUnchanged[] = []

  /**
   * Map of group id -> resolved local class row (after merging by externalId or
   * adoption candidates). Used later to resolve student class assignments.
   */
  const localClassByGroupId = new Map<string, Class>()

  for (const group of entraGroups) {
    const byOid = classByExternalId.get(group.id)
    const byName = byOid
      ? null
      : (classByNormalizedName.get(normalizeName(group.displayName)) ?? null)
    const existingRow = byOid ?? byName

    if (existingRow) {
      localClassByGroupId.set(group.id, existingRow)
    }

    if (!existingRow) {
      classesToCreate.push({ group })
      continue
    }

    matchedClassIds.add(existingRow.id)
    const summary = toClassRowSummary(existingRow)
    const willAdopt = Boolean(byName) && !existingRow.externalId
    const changes = computeClassChanges(summary, group)

    if (!existingRow.isActive) {
      classesToReactivate.push({ existing: summary, group, changes })
      continue
    }

    if (changes.length === 0 && !willAdopt) {
      classesUnchanged.push({ existing: summary })
      continue
    }

    classesToUpdate.push({ existing: summary, group, changes, willAdopt })
  }

  for (const row of classRows) {
    if (matchedClassIds.has(row.id)) continue
    if (!row.isActive) continue
    if (row.externalSource !== EXTERNAL_SOURCE_ENTRA) continue
    classesToDeactivate.push({ existing: toClassRowSummary(row) })
  }

  /* ----- Student diff ----- */

  const studentRows = await prisma.student.findMany({
    where: { isActive: ANY_ACTIVE_STATE },
    include: { class: { select: { name: true } } },
  })
  const studentByExternalId = new Map<string, (typeof studentRows)[number]>()
  const studentByUsername = new Map<string, (typeof studentRows)[number]>()
  for (const row of studentRows) {
    if (row.externalId) studentByExternalId.set(row.externalId, row)
    studentByUsername.set(row.username.toLowerCase(), row)
  }

  const groupDisplayNameById = new Map<string, string>()
  for (const g of entraGroups) groupDisplayNameById.set(g.id, g.displayName)

  const matchedStudentIds = new Set<number>()
  const studentsToCreate: StudentSyncCreate[] = []
  const studentsToUpdate: StudentSyncUpdate[] = []
  const studentsToReactivate: StudentSyncReactivate[] = []
  const studentsToDeactivate: StudentSyncDeactivate[] = []
  const studentsToMarkUnassigned: StudentSyncUnassigned[] = []
  const studentsUnchanged: StudentSyncUnchanged[] = []

  /** Resolves an existing local row for an Entra user, by oid then username. */
  const findExistingStudent = (user: EntraUser) =>
    studentByExternalId.get(user.oid) ?? studentByUsername.get(user.username.toLowerCase()) ?? null

  for (const { user, groupIds } of membershipByOid.values()) {
    const memberGroupIds = Array.from(groupIds)

    if (memberGroupIds.length === 0) {
      issues.push({
        oid: user.oid,
        upn: user.username,
        displayName: user.displayName ?? undefined,
        reason: 'Entra user not in any synced class group',
      })
      continue
    }

    if (memberGroupIds.length > 1) {
      const groupDisplayNames = memberGroupIds.map(id => groupDisplayNameById.get(id) ?? id)
      issues.push({
        oid: user.oid,
        upn: user.username,
        displayName: user.displayName ?? undefined,
        reason: `Entra user belongs to multiple synced class groups: ${groupDisplayNames.join(', ')}`,
      })

      // Their class is ambiguous, so no class is assigned. They are still
      // tracked: marking them matched keeps them out of the deactivation list,
      // and syncStatus records why they have no class. Skipping them, as this
      // used to, left them invisible to sync in both directions.
      const ambiguousExisting = findExistingStudent(user)
      if (ambiguousExisting) matchedStudentIds.add(ambiguousExisting.id)
      studentsToMarkUnassigned.push({
        existing: ambiguousExisting ? toStudentRowSummary(ambiguousExisting) : null,
        entra: user,
        groupDisplayNames,
      })
      continue
    }

    const targetGroupId = memberGroupIds[0]!
    const targetGroupDisplayName = groupDisplayNameById.get(targetGroupId) ?? targetGroupId
    const target: StudentTargetClass = {
      groupId: targetGroupId,
      groupDisplayName: targetGroupDisplayName,
    }

    const existing = findExistingStudent(user)

    if (!existing) {
      studentsToCreate.push({ entra: user, target })
      continue
    }

    matchedStudentIds.add(existing.id)

    const summary = toStudentRowSummary(existing)
    const willAdopt = !existing.externalId || existing.externalSource !== EXTERNAL_SOURCE_ENTRA

    const profileChanges = computeStudentProfileChanges(existing, user)
    const localClassForGroup = localClassByGroupId.get(targetGroupId)
    const localClassIdForGroup = localClassForGroup?.id ?? null
    const classWillChange =
      localClassIdForGroup != null && existing.classId !== localClassIdForGroup
    const classIsNewGroup = localClassIdForGroup == null

    const changes: StudentChange[] = [...profileChanges]
    if (classWillChange || classIsNewGroup) changes.push('class')

    const classChange =
      classWillChange || classIsNewGroup
        ? {
            fromClassName: summary.className,
            toGroupDisplayName: targetGroupDisplayName,
            clearedGroupId: summary.groupId,
          }
        : null

    if (!existing.isActive) {
      studentsToReactivate.push({ existing: summary, entra: user, target, changes, classChange })
      continue
    }

    if (changes.length === 0 && !willAdopt) {
      studentsUnchanged.push({ existing: summary })
      continue
    }

    studentsToUpdate.push({
      existing: summary,
      entra: user,
      changes,
      willAdopt,
      classChange,
      target,
    })
  }

  for (const row of studentRows) {
    if (matchedStudentIds.has(row.id)) continue
    if (!row.isActive) continue
    if (row.externalSource !== EXTERNAL_SOURCE_ENTRA) continue
    studentsToDeactivate.push({ existing: toStudentRowSummary(row) })
  }

  /* ----- Sort & return ----- */

  const sortByTargetClassThenEntraName = <
    T extends { entra: EntraUser; target: StudentTargetClass },
  >(
    rows: T[],
  ): T[] =>
    rows.sort((a, b) => {
      const classCmp = a.target.groupDisplayName.localeCompare(
        b.target.groupDisplayName,
        undefined,
        {
          sensitivity: 'base',
        },
      )
      if (classCmp !== 0) return classCmp
      const lastCmp = a.entra.lastName.localeCompare(b.entra.lastName, undefined, {
        sensitivity: 'base',
      })
      if (lastCmp !== 0) return lastCmp
      return a.entra.firstName.localeCompare(b.entra.firstName, undefined, {
        sensitivity: 'base',
      })
    })
  const sortByEntraLastName = <T extends { entra: EntraUser }>(rows: T[]): T[] =>
    rows.sort((a, b) => {
      const lastCmp = a.entra.lastName.localeCompare(b.entra.lastName, undefined, {
        sensitivity: 'base',
      })
      if (lastCmp !== 0) return lastCmp
      return a.entra.firstName.localeCompare(b.entra.firstName, undefined, {
        sensitivity: 'base',
      })
    })
  const sortByExistingLastName = <T extends { existing: { lastName: string } }>(rows: T[]): T[] =>
    rows.sort((a, b) =>
      a.existing.lastName.localeCompare(b.existing.lastName, undefined, { sensitivity: 'base' }),
    )
  const sortByGroupDisplayName = <T extends { group: { displayName: string } }>(rows: T[]): T[] =>
    rows.sort((a, b) =>
      a.group.displayName.localeCompare(b.group.displayName, undefined, { sensitivity: 'base' }),
    )
  const sortByExistingName = <T extends { existing: { name: string } }>(rows: T[]): T[] =>
    rows.sort((a, b) =>
      a.existing.name.localeCompare(b.existing.name, undefined, { sensitivity: 'base' }),
    )

  sortByGroupDisplayName(classesToCreate)
  sortByGroupDisplayName(classesToUpdate)
  sortByGroupDisplayName(classesToReactivate)
  sortByExistingName(classesToDeactivate)
  sortByExistingName(classesUnchanged)

  sortByEntraLastName(studentsToMarkUnassigned)
  sortByTargetClassThenEntraName(studentsToCreate)
  sortByTargetClassThenEntraName(studentsToUpdate)
  sortByTargetClassThenEntraName(studentsToReactivate)
  sortByExistingLastName(studentsToDeactivate)
  sortByExistingLastName(studentsUnchanged)

  return {
    classes: {
      toCreate: classesToCreate,
      toUpdate: classesToUpdate,
      toDeactivate: classesToDeactivate,
      toReactivate: classesToReactivate,
      unchanged: classesUnchanged,
    },
    students: {
      toCreate: studentsToCreate,
      toUpdate: studentsToUpdate,
      toDeactivate: studentsToDeactivate,
      toReactivate: studentsToReactivate,
      toMarkUnassigned: studentsToMarkUnassigned,
      unchanged: studentsUnchanged,
    },
    issues,
    schoolYearId: schoolYear.id,
    schoolYearLabel: schoolYear.label,
    fetchedAt: new Date().toISOString(),
    syncedClassGroupIds,
    unresolvedGroupIds,
    debug: {
      resolvedGroupCount: syncedClassGroupIds.length - unresolvedGroupIds.length,
      mappedGroupCount: entraGroups.length,
      fetchedMemberCount,
      mappedUserCount: membershipByOid.size,
      classRowCount: classRows.length,
      studentRowCount: studentRows.length,
    },
  }
}

/**
 * ---- Apply -------------------------------------------------------------------------------------
 */

/**
 * Recomputes the diff and applies the selected changes inside a single transaction.
 * Writes a sync-run record on DirectorySyncSettings on success/failure.
 */
export async function applyClassStudentSync(
  selection?: ClassStudentSyncSelection,
  options: ClassStudentSyncApplyOptions = {},
): Promise<ClassStudentSyncSummary> {
  const diff = await previewClassStudentSync(options)
  const now = new Date()
  const deactivationLimit =
    options.maxDeactivationRatio === undefined
      ? resolveMaxDeactivationRatio()
      : options.maxDeactivationRatio

  try {
    const classSelection = selection?.classes ?? {}
    const studentSelection = selection?.students ?? {}

    const selectedClassCreateGroupIds = classSelection.createGroupIds
      ? new Set(classSelection.createGroupIds)
      : null
    const selectedClassUpdateGroupIds = classSelection.updateGroupIds
      ? new Set(classSelection.updateGroupIds)
      : null
    const selectedClassReactivateGroupIds = classSelection.reactivateGroupIds
      ? new Set(classSelection.reactivateGroupIds)
      : null
    const selectedClassDeactivateIds = classSelection.deactivateClassIds
      ? new Set(classSelection.deactivateClassIds)
      : null

    const selectedStudentCreateOids = studentSelection.createOids
      ? new Set(studentSelection.createOids)
      : null
    const selectedStudentUpdateOids = studentSelection.updateOids
      ? new Set(studentSelection.updateOids)
      : null
    const selectedStudentReactivateOids = studentSelection.reactivateOids
      ? new Set(studentSelection.reactivateOids)
      : null
    const selectedStudentUnassignedOids = studentSelection.unassignedOids
      ? new Set(studentSelection.unassignedOids)
      : null
    const selectedStudentDeactivateIds = studentSelection.deactivateStudentIds
      ? new Set(studentSelection.deactivateStudentIds)
      : null

    const classCreates = selectedClassCreateGroupIds
      ? diff.classes.toCreate.filter(c => selectedClassCreateGroupIds.has(c.group.id))
      : diff.classes.toCreate
    const classUpdates = selectedClassUpdateGroupIds
      ? diff.classes.toUpdate.filter(c => selectedClassUpdateGroupIds.has(c.group.id))
      : diff.classes.toUpdate
    const classReactivations = selectedClassReactivateGroupIds
      ? diff.classes.toReactivate.filter(c => selectedClassReactivateGroupIds.has(c.group.id))
      : diff.classes.toReactivate
    const classDeactivations = selectedClassDeactivateIds
      ? diff.classes.toDeactivate.filter(c => selectedClassDeactivateIds.has(c.existing.id))
      : diff.classes.toDeactivate

    const studentCreates = selectedStudentCreateOids
      ? diff.students.toCreate.filter(s => selectedStudentCreateOids.has(s.entra.oid))
      : diff.students.toCreate
    const studentUpdates = selectedStudentUpdateOids
      ? diff.students.toUpdate.filter(s => selectedStudentUpdateOids.has(s.entra.oid))
      : diff.students.toUpdate
    const studentReactivations = selectedStudentReactivateOids
      ? diff.students.toReactivate.filter(s => selectedStudentReactivateOids.has(s.entra.oid))
      : diff.students.toReactivate
    const studentDeactivations = selectedStudentDeactivateIds
      ? diff.students.toDeactivate.filter(s => selectedStudentDeactivateIds.has(s.existing.id))
      : diff.students.toDeactivate
    const studentUnassignments = selectedStudentUnassignedOids
      ? diff.students.toMarkUnassigned.filter(s => selectedStudentUnassignedOids.has(s.entra.oid))
      : diff.students.toMarkUnassigned

    // Rows that were active going in: everything matched and live, plus the
    // ones this run would retire. Reactivations are excluded because they were
    // inactive before.
    assertDeactivationWithinLimit({
      scope: 'classes',
      deactivating: classDeactivations.length,
      activeBefore:
        diff.classes.unchanged.length +
        diff.classes.toUpdate.length +
        diff.classes.toDeactivate.length,
      limit: deactivationLimit,
    })
    assertDeactivationWithinLimit({
      scope: 'students',
      deactivating: studentDeactivations.length,
      activeBefore:
        diff.students.unchanged.length +
        diff.students.toUpdate.length +
        diff.students.toDeactivate.length,
      limit: deactivationLimit,
    })

    const classAdoptedCount = classUpdates.filter(c => c.willAdopt).length
    const studentAdoptedCount = studentUpdates.filter(s => s.willAdopt).length

    await prisma.$transaction(async tx => {
      /* --- Classes --- */

      /**
       * Moves the rotation groups of a renamed class onto its new name.
       *
       * `GroupAssignment` is keyed by the class *name*, not its id, so a class
       * renamed in Entra would otherwise leave its groups behind under the old
       * name: the class keeps its students and their group numbers, but the
       * rotation editor reads no groups for it and the schedule pages render an
       * empty rotation.
       *
       * Rows already sitting under the new name can only be orphans — `Class.name`
       * is unique, so no live class holds that name at this point — and they would
       * collide with the unique (class, groupId) index, so they are dropped.
       */
      const migrateGroupAssignments = async (fromName: string, toName: string) => {
        if (fromName === toName) return
        await tx.groupAssignment.deleteMany({ where: { class: toName } })
        await tx.groupAssignment.updateMany({
          where: { class: fromName },
          data: { class: toName },
        })
      }

      // Map of Entra group id -> local class id after this transaction.
      const classIdByGroupId = new Map<string, number>()

      for (const c of diff.classes.toUpdate) {
        if (c.existing.externalId === c.group.id || c.willAdopt) {
          classIdByGroupId.set(c.group.id, c.existing.id)
        }
      }
      for (const c of diff.classes.unchanged) {
        if (c.existing.externalId) classIdByGroupId.set(c.existing.externalId, c.existing.id)
      }
      for (const c of diff.classes.toReactivate) {
        classIdByGroupId.set(c.group.id, c.existing.id)
      }

      for (const { group } of classCreates) {
        const created = await tx.class.create({
          data: {
            name: group.displayName,
            description: group.description,
            externalId: group.id,
            externalSource: EXTERNAL_SOURCE_ENTRA,
            isActive: true,
            lastSyncedAt: now,
          },
        })
        classIdByGroupId.set(group.id, created.id)
      }

      for (const update of classUpdates) {
        const data: Prisma.ClassUpdateInput = {
          name: update.group.displayName,
          description: update.group.description,
          lastSyncedAt: now,
        }
        if (update.willAdopt) {
          data.externalId = update.group.id
          data.externalSource = EXTERNAL_SOURCE_ENTRA
        }
        await migrateGroupAssignments(update.existing.name, update.group.displayName)
        await tx.class.update({ where: { id: update.existing.id }, data })
        classIdByGroupId.set(update.group.id, update.existing.id)
      }

      for (const reactivate of classReactivations) {
        await migrateGroupAssignments(reactivate.existing.name, reactivate.group.displayName)
        await tx.class.update({
          where: { id: reactivate.existing.id },
          data: {
            name: reactivate.group.displayName,
            description: reactivate.group.description,
            externalId: reactivate.group.id,
            externalSource: EXTERNAL_SOURCE_ENTRA,
            isActive: true,
            deactivatedAt: null,
            lastSyncedAt: now,
          },
        })
        classIdByGroupId.set(reactivate.group.id, reactivate.existing.id)
      }

      for (const { existing } of classDeactivations) {
        await tx.class.update({
          where: { id: existing.id },
          data: {
            isActive: false,
            deactivatedAt: now,
            lastSyncedAt: now,
          },
        })
      }

      /* --- Students --- */

      const resolveClassIdForGroup = async (groupId: string): Promise<number | null> => {
        const cached = classIdByGroupId.get(groupId)
        if (cached != null) return cached
        // Fallback: the caller did not select the class row but it exists; look it up.
        const row = await tx.class.findUnique({
          where: { externalId: groupId },
          select: { id: true },
        })
        if (row) classIdByGroupId.set(groupId, row.id)
        return row?.id ?? null
      }

      const upsertMembership = async (studentId: number, classId: number) => {
        await tx.classMembership.upsert({
          where: { studentId_schoolYearId: { studentId, schoolYearId: diff.schoolYearId } },
          create: { studentId, classId, schoolYearId: diff.schoolYearId },
          update: { classId },
        })
      }

      for (const { entra, target } of studentCreates) {
        const classId = await resolveClassIdForGroup(target.groupId)
        const created = await tx.student.create({
          data: {
            firstName: entra.firstName,
            lastName: entra.lastName,
            username: entra.username,
            email: entra.email,
            sokratesId: entra.sokratesId,
            classId: classId ?? undefined,
            externalId: entra.oid,
            externalSource: EXTERNAL_SOURCE_ENTRA,
            isActive: true,
            lastSyncedAt: now,
            syncStatus: 'active',
          },
        })
        if (classId != null) {
          await upsertMembership(created.id, classId)
        }
      }

      for (const update of studentUpdates) {
        const classId = await resolveClassIdForGroup(update.target.groupId)
        const data: Prisma.StudentUpdateInput = {
          firstName: update.entra.firstName,
          lastName: update.entra.lastName,
          username: update.entra.username,
          email: update.entra.email,
          lastSyncedAt: now,
          syncStatus: 'active',
        }
        // Only write a Sokrates id Entra actually returned, so a transient null
        // never wipes the value the NM link sync depends on.
        if (update.entra.sokratesId) data.sokratesId = update.entra.sokratesId
        if (classId != null) {
          data.class = { connect: { id: classId } }
          // Rotation groups are numbered per class (GroupAssignment is keyed by
          // class name + group number), so carrying a group number across a
          // class move silently drops the student into an unrelated group — or
          // conjures a group the destination class does not have, because
          // GET /api/schedules/assignments back-fills GroupAssignment from
          // whatever group numbers it finds on students. Clearing it puts them
          // in the rotation editor's "unassigned" bucket, where a human decides.
          if (update.existing.classId !== classId) {
            data.groupId = null
          }
        }
        if (update.willAdopt) {
          data.externalId = update.entra.oid
          data.externalSource = EXTERNAL_SOURCE_ENTRA
        }
        await tx.student.update({ where: { id: update.existing.id }, data })
        if (classId != null) {
          await upsertMembership(update.existing.id, classId)
        }
      }

      for (const reactivate of studentReactivations) {
        const classId = await resolveClassIdForGroup(reactivate.target.groupId)
        await tx.student.update({
          where: { id: reactivate.existing.id },
          data: {
            firstName: reactivate.entra.firstName,
            lastName: reactivate.entra.lastName,
            username: reactivate.entra.username,
            email: reactivate.entra.email,
            ...(reactivate.entra.sokratesId
              ? { sokratesId: reactivate.entra.sokratesId }
              : {}),
            externalId: reactivate.entra.oid,
            externalSource: EXTERNAL_SOURCE_ENTRA,
            classId: classId ?? undefined,
            // Same reasoning as the update path: a group number from the class
            // they left means nothing in the one they return to.
            ...(classId != null && reactivate.existing.classId !== classId
              ? { groupId: null }
              : {}),
            isActive: true,
            deactivatedAt: null,
            lastSyncedAt: now,
            syncStatus: 'active',
          },
        })
        if (classId != null) {
          await upsertMembership(reactivate.existing.id, classId)
        }
      }

      for (const unassigned of studentUnassignments) {
        // Profile fields still come from Entra; only the class is withheld
        // because the source of truth is ambiguous.
        if (unassigned.existing) {
          await tx.student.update({
            where: { id: unassigned.existing.id },
            data: {
              firstName: unassigned.entra.firstName,
              lastName: unassigned.entra.lastName,
              username: unassigned.entra.username,
              email: unassigned.entra.email,
              ...(unassigned.entra.sokratesId
                ? { sokratesId: unassigned.entra.sokratesId }
                : {}),
              isActive: true,
              deactivatedAt: null,
              lastSyncedAt: now,
              syncStatus: 'unassigned',
            },
          })
        } else {
          await tx.student.create({
            data: {
              firstName: unassigned.entra.firstName,
              lastName: unassigned.entra.lastName,
              username: unassigned.entra.username,
              email: unassigned.entra.email,
              sokratesId: unassigned.entra.sokratesId,
              externalId: unassigned.entra.oid,
              externalSource: EXTERNAL_SOURCE_ENTRA,
              isActive: true,
              lastSyncedAt: now,
              syncStatus: 'unassigned',
            },
          })
        }
      }

      for (const { existing } of studentDeactivations) {
        await tx.student.update({
          where: { id: existing.id },
          data: {
            isActive: false,
            deactivatedAt: now,
            lastSyncedAt: now,
          },
        })
      }
    })

    const summary: ClassStudentSyncSummary = {
      classes: {
        created: classCreates.length,
        updated: classUpdates.length - classAdoptedCount,
        adopted: classAdoptedCount,
        deactivated: classDeactivations.length,
        reactivated: classReactivations.length,
        unchanged: diff.classes.unchanged.length,
      },
      students: {
        created: studentCreates.length,
        updated: studentUpdates.length - studentAdoptedCount,
        adopted: studentAdoptedCount,
        deactivated: studentDeactivations.length,
        reactivated: studentReactivations.length,
        unassigned: studentUnassignments.length,
        unchanged: diff.students.unchanged.length,
      },
      issues: diff.issues,
      schoolYearId: diff.schoolYearId,
      completedAt: now.toISOString(),
    }

    await recordSyncRun({
      status: diff.issues.length > 0 ? 'partial' : 'success',
      summary: { scope: 'classes_students', ...summary },
    })

    return summary
  } catch (error) {
    captureError(error, {
      location: 'lib/class-student-sync',
      type: 'apply_class_student_sync_error',
    })

    await recordSyncRun({
      status: 'failed',
      summary: {
        scope: 'classes_students',
        error: error instanceof Error ? error.message : String(error),
        attemptedAt: now.toISOString(),
        schoolYearId: diff.schoolYearId,
      },
    })

    throw error
  }
}
