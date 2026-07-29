import { normalizeUsername } from '@/lib/username'
import type { EntraGroupMember } from '@/lib/graph'

/**
 * Canonical internal DTO for an Entra-backed person (teacher or student).
 */
export interface EntraUser {
  oid: string
  firstName: string
  lastName: string
  email: string | null
  username: string
  displayName: string | null
}

/**
 * Issue emitted when an Entra member cannot be mapped to an {@link EntraUser}.
 * Shape is shared across teacher-sync and class-student-sync so the issues
 * tab rendering stays identical.
 */
export interface EntraUserMappingIssue {
  oid?: string
  upn?: string
  displayName?: string
  reason: string
}

function splitDisplayName(displayName: string | null | undefined): {
  firstName: string
  lastName: string
} | null {
  const clean = (displayName ?? '').trim()
  if (!clean) return null
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1] ?? '',
  }
}

/**
 * Maps an {@link EntraGroupMember} onto the canonical {@link EntraUser} shape.
 * Returns a mapping issue instead of throwing so the caller can collect and
 * surface all problems in a single preview pass.
 */
export function mapMemberToEntraUser(member: EntraGroupMember): {
  user: EntraUser | null
  issue: EntraUserMappingIssue | null
} {
  const oid = member.id?.trim()
  if (!oid) {
    return {
      user: null,
      issue: {
        displayName: member.displayName ?? undefined,
        reason: 'Entra member has no id (oid)',
      },
    }
  }

  const upnRaw = member.userPrincipalName ?? member.mail ?? ''
  const upn = upnRaw.trim()
  const username = normalizeUsername(upn)

  if (!username) {
    return {
      user: null,
      issue: {
        oid,
        upn: upnRaw || undefined,
        displayName: member.displayName ?? undefined,
        reason: 'Entra member has no resolvable userPrincipalName/mail',
      },
    }
  }

  let givenName = (member.givenName ?? '').trim()
  let surname = (member.surname ?? '').trim()

  // Some tenants don't populate givenName/surname consistently for students.
  // Fall back to displayName split to avoid dropping valid users from sync.
  if (!givenName || !surname) {
    const fromDisplayName = splitDisplayName(member.displayName)
    if (fromDisplayName) {
      if (!givenName) givenName = fromDisplayName.firstName
      if (!surname) surname = fromDisplayName.lastName
    }
  }

  if (!givenName || !surname) {
    return {
      user: null,
      issue: {
        oid,
        upn: upn || undefined,
        displayName: member.displayName ?? undefined,
        reason: 'Entra member is missing givenName or surname',
      },
    }
  }

  return {
    user: {
      oid,
      firstName: givenName,
      lastName: surname,
      email: (member.mail ?? upn).trim() || null,
      username,
      displayName: member.displayName ?? null,
    },
    issue: null,
  }
}
