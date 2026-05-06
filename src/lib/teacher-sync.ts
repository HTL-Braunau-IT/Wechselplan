import type { Prisma, Teacher } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { collectGroupMembers } from '@/lib/graph'
import { recordSyncRun } from '@/lib/directory-sync-settings'
import {
  mapMemberToEntraUser,
  type EntraUser,
  type EntraUserMappingIssue,
} from '@/lib/entra-user-mapper'
import { normalizeUsername } from '@/lib/username'

export const EXTERNAL_SOURCE_ENTRA = 'entra'

/**
 * Backwards-compatible alias kept for existing imports.
 */
export type EntraTeacher = EntraUser

export type TeacherSyncChange = 'firstName' | 'lastName' | 'email' | 'username'

export type TeacherSyncIssue = EntraUserMappingIssue

export interface TeacherSyncCreate {
  entra: EntraTeacher
}

export interface TeacherSyncUpdate {
  existing: Pick<Teacher, 'id' | 'firstName' | 'lastName' | 'email' | 'username' | 'externalId' | 'externalSource' | 'isActive'>
  entra: EntraTeacher
  changes: TeacherSyncChange[]
  willAdopt: boolean
}

export interface TeacherSyncDeactivate {
  existing: Pick<Teacher, 'id' | 'firstName' | 'lastName' | 'username' | 'email' | 'externalId'>
}

export interface TeacherSyncReactivate {
  existing: Pick<Teacher, 'id' | 'firstName' | 'lastName' | 'username' | 'email' | 'externalId'>
  entra: EntraTeacher
  changes: TeacherSyncChange[]
}

export interface TeacherSyncUnchanged {
  existing: Pick<Teacher, 'id' | 'firstName' | 'lastName' | 'username' | 'email' | 'externalId'>
}

export interface TeacherSyncDiff {
  toCreate: TeacherSyncCreate[]
  toUpdate: TeacherSyncUpdate[]
  toDeactivate: TeacherSyncDeactivate[]
  toReactivate: TeacherSyncReactivate[]
  unchanged: TeacherSyncUnchanged[]
  issues: TeacherSyncIssue[]
  fetchedAt: string
}

export interface TeacherSyncSummary {
  created: number
  updated: number
  adopted: number
  deactivated: number
  reactivated: number
  unchanged: number
  issues: TeacherSyncIssue[]
  completedAt: string
}

export interface TeacherSyncSelection {
  createOids?: string[]
  updateOids?: string[]
  reactivateOids?: string[]
  deactivateTeacherIds?: number[]
}

function emailIdentityKey(email: string | null): string | null {
  if (!email) return null
  const key = normalizeUsername(email)
  return key || null
}

function resolveTeacherGroupId(): string {
  const id = process.env.ENTRA_TEACHER_GROUP_ID?.trim()
  if (!id) {
    throw new Error('ENTRA_TEACHER_GROUP_ID is not configured')
  }
  return id
}

function computeChanges(
  existing: Pick<Teacher, 'firstName' | 'lastName' | 'email' | 'username'>,
  next: EntraTeacher,
): TeacherSyncChange[] {
  const changes: TeacherSyncChange[] = []
  if (existing.firstName !== next.firstName) changes.push('firstName')
  if (existing.lastName !== next.lastName) changes.push('lastName')
  if ((existing.email ?? null) !== (next.email ?? null)) changes.push('email')
  if (existing.username !== next.username) changes.push('username')
  return changes
}

/**
 * Computes the diff between the current Teacher table and the members of the
 * Entra teacher group. Performs no writes.
 */
export async function previewTeacherSync(): Promise<TeacherSyncDiff> {
  const teacherGroupId = resolveTeacherGroupId()
  const members = await collectGroupMembers(teacherGroupId)

  const entraTeachers: EntraTeacher[] = []
  const issues: TeacherSyncIssue[] = []
  const seenOids = new Set<string>()

  for (const member of members) {
    const mapped = mapMemberToEntraUser(member)
    if (mapped.issue) {
      issues.push(mapped.issue)
      continue
    }
    if (mapped.user) {
      if (seenOids.has(mapped.user.oid)) {
        issues.push({
          oid: mapped.user.oid,
          upn: mapped.user.username,
          displayName: mapped.user.displayName ?? undefined,
          reason: 'Duplicate Entra member in group',
        })
        continue
      }
      seenOids.add(mapped.user.oid)
      entraTeachers.push(mapped.user)
    }
  }

  // Flag duplicate normalized usernames across the Entra side so admins can
  // investigate (shouldn't happen, but Graph occasionally duplicates members).
  const usernameCounts = new Map<string, number>()
  for (const t of entraTeachers) {
    usernameCounts.set(t.username, (usernameCounts.get(t.username) ?? 0) + 1)
  }
  for (const [username, count] of usernameCounts) {
    if (count > 1) {
      issues.push({
        upn: username,
        reason: `Multiple Entra teachers share the same username "${username}" after normalization`,
      })
    }
  }

  const existingTeachers = await prisma.teacher.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      username: true,
      externalId: true,
      externalSource: true,
      isActive: true,
    },
  })

  const byExternalId = new Map<string, (typeof existingTeachers)[number]>()
  const byUsername = new Map<string, (typeof existingTeachers)[number][]>()
  const byEmail = new Map<string, (typeof existingTeachers)[number][]>()

  for (const teacher of existingTeachers) {
    if (teacher.externalId) {
      byExternalId.set(teacher.externalId, teacher)
      continue
    }

    const usernameMatches = byUsername.get(teacher.username) ?? []
    usernameMatches.push(teacher)
    byUsername.set(teacher.username, usernameMatches)

    const emailKey = emailIdentityKey(teacher.email)
    if (emailKey) {
      const emailMatches = byEmail.get(emailKey) ?? []
      emailMatches.push(teacher)
      byEmail.set(emailKey, emailMatches)
    }
  }

  const matchedExistingIds = new Set<number>()
  const toCreate: TeacherSyncCreate[] = []
  const toUpdate: TeacherSyncUpdate[] = []
  const toReactivate: TeacherSyncReactivate[] = []
  const toDeactivate: TeacherSyncDeactivate[] = []
  const unchanged: TeacherSyncUnchanged[] = []

  for (const entra of entraTeachers) {
    const byOidMatch = byExternalId.get(entra.oid) ?? null
    const usernameCandidates = byOidMatch ? [] : (byUsername.get(entra.username) ?? [])
    const emailCandidates = byOidMatch
      ? []
      : (() => {
          const key = emailIdentityKey(entra.email)
          return key ? (byEmail.get(key) ?? []) : []
        })()

    if (!byOidMatch && usernameCandidates.length > 1) {
      issues.push({
        oid: entra.oid,
        upn: entra.username,
        displayName: entra.displayName ?? undefined,
        reason: `Ambiguous local teacher match by username "${entra.username}" (${usernameCandidates.length} candidates)`,
      })
      continue
    }

    if (!byOidMatch && usernameCandidates.length === 0 && emailCandidates.length > 1) {
      issues.push({
        oid: entra.oid,
        upn: entra.username,
        displayName: entra.displayName ?? undefined,
        reason: `Ambiguous local teacher match by email "${entra.email ?? '-'}" (${emailCandidates.length} candidates)`,
      })
      continue
    }

    const usernameMatch = usernameCandidates[0] ?? null
    const emailMatch = emailCandidates[0] ?? null
    if (!byOidMatch && usernameMatch && emailMatch && usernameMatch.id !== emailMatch.id) {
      issues.push({
        oid: entra.oid,
        upn: entra.username,
        displayName: entra.displayName ?? undefined,
        reason: `Conflicting local teacher candidates (username->${usernameMatch.id}, email->${emailMatch.id})`,
      })
      continue
    }

    const existing = byOidMatch ?? usernameMatch ?? emailMatch
    if (!existing) {
      toCreate.push({ entra })
      continue
    }

    matchedExistingIds.add(existing.id)

    const changes = computeChanges(existing, entra)
    const willAdopt = !byOidMatch && existing.externalId == null
    const wasInactive = !existing.isActive

    if (wasInactive) {
      toReactivate.push({
        existing,
        entra,
        changes,
      })
      continue
    }

    if (changes.length === 0 && !willAdopt) {
      unchanged.push({ existing })
      continue
    }

    toUpdate.push({ existing, entra, changes, willAdopt })
  }

  for (const existing of existingTeachers) {
    if (matchedExistingIds.has(existing.id)) continue
    if (!existing.isActive) continue
    if (existing.externalSource !== EXTERNAL_SOURCE_ENTRA) continue
    toDeactivate.push({ existing })
  }

  const sortByEntraLastName = <T extends { entra: EntraTeacher }>(rows: T[]): T[] =>
    rows.sort((a, b) =>
      a.entra.lastName.localeCompare(b.entra.lastName, undefined, { sensitivity: 'base' }),
    )

  const sortByExistingLastName = <T extends { existing: { lastName: string } }>(rows: T[]): T[] =>
    rows.sort((a, b) =>
      a.existing.lastName.localeCompare(b.existing.lastName, undefined, { sensitivity: 'base' }),
    )

  sortByEntraLastName(toCreate)
  sortByEntraLastName(toUpdate)
  sortByEntraLastName(toReactivate)
  sortByExistingLastName(toDeactivate)
  sortByExistingLastName(unchanged)

  return {
    toCreate,
    toUpdate,
    toDeactivate,
    toReactivate,
    unchanged,
    issues,
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * Recomputes the diff and applies it to the DB inside a transaction.
 * Writes a sync-run record on DirectorySyncSettings on success/failure.
 */
export async function applyTeacherSync(selection?: TeacherSyncSelection): Promise<TeacherSyncSummary> {
  const diff = await previewTeacherSync()
  const now = new Date()

  try {
    const selectedCreateOids = selection?.createOids ? new Set(selection.createOids) : null
    const selectedUpdateOids = selection?.updateOids ? new Set(selection.updateOids) : null
    const selectedReactivateOids = selection?.reactivateOids ? new Set(selection.reactivateOids) : null
    const selectedDeactivateTeacherIds = selection?.deactivateTeacherIds
      ? new Set(selection.deactivateTeacherIds)
      : null

    const selectedCreates = selectedCreateOids
      ? diff.toCreate.filter(item => selectedCreateOids.has(item.entra.oid))
      : diff.toCreate
    const selectedUpdates = selectedUpdateOids
      ? diff.toUpdate.filter(item => selectedUpdateOids.has(item.entra.oid))
      : diff.toUpdate
    const selectedReactivations = selectedReactivateOids
      ? diff.toReactivate.filter(item => selectedReactivateOids.has(item.entra.oid))
      : diff.toReactivate
    const selectedDeactivations = selectedDeactivateTeacherIds
      ? diff.toDeactivate.filter(item => selectedDeactivateTeacherIds.has(item.existing.id))
      : diff.toDeactivate

    const adoptedCount = selectedUpdates.filter(u => u.willAdopt).length

    await prisma.$transaction(async tx => {
      for (const { entra } of selectedCreates) {
        await tx.teacher.create({
          data: {
            firstName: entra.firstName,
            lastName: entra.lastName,
            email: entra.email,
            username: entra.username,
            externalId: entra.oid,
            externalSource: EXTERNAL_SOURCE_ENTRA,
            isActive: true,
            lastSyncedAt: now,
          },
        })
      }

      for (const update of selectedUpdates) {
        const data: Prisma.TeacherUpdateInput = {
          firstName: update.entra.firstName,
          lastName: update.entra.lastName,
          email: update.entra.email,
          username: update.entra.username,
          lastSyncedAt: now,
        }
        if (update.willAdopt) {
          data.externalId = update.entra.oid
          data.externalSource = EXTERNAL_SOURCE_ENTRA
        }
        await tx.teacher.update({
          where: { id: update.existing.id },
          data,
        })
      }

      for (const reactivate of selectedReactivations) {
        await tx.teacher.update({
          where: { id: reactivate.existing.id },
          data: {
            firstName: reactivate.entra.firstName,
            lastName: reactivate.entra.lastName,
            email: reactivate.entra.email,
            username: reactivate.entra.username,
            externalId: reactivate.entra.oid,
            externalSource: EXTERNAL_SOURCE_ENTRA,
            isActive: true,
            deactivatedAt: null,
            lastSyncedAt: now,
          },
        })
      }

      for (const { existing } of selectedDeactivations) {
        await tx.teacher.update({
          where: { id: existing.id },
          data: {
            isActive: false,
            deactivatedAt: now,
            lastSyncedAt: now,
          },
        })
      }
    })

    const summary: TeacherSyncSummary = {
      created: selectedCreates.length,
      updated: selectedUpdates.length - adoptedCount,
      adopted: adoptedCount,
      deactivated: selectedDeactivations.length,
      reactivated: selectedReactivations.length,
      unchanged: diff.unchanged.length,
      issues: diff.issues,
      completedAt: now.toISOString(),
    }

    await recordSyncRun({
      status: diff.issues.length > 0 ? 'partial' : 'success',
      summary: { scope: 'teachers', ...summary },
    })

    return summary
  } catch (error) {
    captureError(error, {
      location: 'lib/teacher-sync',
      type: 'apply_teacher_sync_error',
    })

    await recordSyncRun({
      status: 'failed',
      summary: {
        scope: 'teachers',
        error: error instanceof Error ? error.message : String(error),
        attemptedAt: now.toISOString(),
      },
    })

    throw error
  }
}
