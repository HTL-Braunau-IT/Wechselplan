import { type NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import { prisma } from '@/lib/prisma'
import type { User } from 'next-auth'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { checkMemberGroups } from '@/lib/graph'
import { getSyncedClassGroupIdsCached } from '@/lib/directory-sync-settings'

type AppRole = 'admin' | 'teacher' | 'student' | 'user'

export interface MicrosoftAccess {
  allowed: boolean
  role: AppRole
}

/**
 * How long a resolved access decision is reused before Graph is consulted
 * again. This bounds how long a user keeps teacher or admin rights after being
 * removed from the Entra group; sessions themselves live far longer.
 */
const ACCESS_CACHE_TTL_MS = 15 * 60 * 1000

const accessCache = new Map<string, { value: MicrosoftAccess; expiresAt: number }>()

/**
 * Resolves whether an Entra user may sign in, and with which role.
 *
 * Membership is read with the **app-only** Graph token via `checkMemberGroups`
 * rather than the user's delegated token against `/me/memberOf`. That matters
 * for three reasons: it does not depend on delegated `GroupMember.Read.All`
 * consent (the provider only requests `openid profile email`), it is
 * transitive so nested class groups resolve the same way class sync sees them,
 * and it works without an `access_token` in hand, which is what lets roles be
 * re-checked on an existing session instead of only at sign-in.
 *
 * The synced class group list comes from the database, which is what the admin
 * settings UI writes; the `ENTRA_SYNC_CLASS_GROUP_IDS` env var is only a
 * first-run bootstrap and is applied inside `getDirectorySyncSettings`.
 *
 * With neither a teacher group nor any class group configured there is nothing
 * to ask Graph about, and this denies rather than falling open. That is the
 * safe direction, but note it locks out *everyone*, super admin included:
 * ENTRA_SUPER_ADMIN_OBJECT_ID is applied in the `jwt` callback, which never
 * runs once `signIn` has refused. Set ENTRA_TEACHER_GROUP_ID before first boot.
 */
export async function resolveMicrosoftAccess(objectId: string): Promise<MicrosoftAccess> {
  const oid = objectId?.trim()
  if (!oid) {
    return { allowed: false, role: 'user' }
  }

  const now = Date.now()
  const cached = accessCache.get(oid)
  if (cached && now < cached.expiresAt) {
    return cached.value
  }

  const teacherGroupId = process.env.ENTRA_TEACHER_GROUP_ID?.trim()
  const syncedClassGroupIds = await getSyncedClassGroupIdsCached()

  const teacherGroups = [teacherGroupId].filter((id): id is string => Boolean(id))
  const studentGroups = syncedClassGroupIds

  const candidates = [...teacherGroups, ...studentGroups]
  if (candidates.length === 0) {
    // Nothing configured yet: deny rather than fall open.
    const value: MicrosoftAccess = { allowed: false, role: 'user' }
    accessCache.set(oid, { value, expiresAt: now + ACCESS_CACHE_TTL_MS })
    return value
  }

  const memberOf = new Set(await checkMemberGroups(oid, candidates))

  const isTeacher = teacherGroups.some(id => memberOf.has(id))
  const isStudent = studentGroups.some(id => memberOf.has(id))

  const value: MicrosoftAccess = isTeacher
    ? { allowed: true, role: 'teacher' }
    : isStudent
      ? { allowed: true, role: 'student' }
      : { allowed: false, role: 'user' }

  accessCache.set(oid, { value, expiresAt: now + ACCESS_CACHE_TTL_MS })
  return value
}

/** Drops a cached access decision, e.g. after an admin role change. */
export function invalidateMicrosoftAccess(objectId?: string): void {
  if (objectId) accessCache.delete(objectId.trim())
  else accessCache.clear()
}

async function ensureRolesExist() {
  try {
    const roles = ['admin', 'teacher', 'student', 'user']
    for (const role of roles) {
      await prisma.role.upsert({
        where: { name: role },
        update: {},
        create: {
          name: role,
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} role`,
        },
      })
    }
  } catch (error) {
    console.error('Error ensuring roles exist:', error)
    captureError(error, {
      location: 'auth',
      type: 'ensure_roles_error',
    })
  }
}

async function hasLocalAdminRole(userId: string): Promise<boolean> {
  try {
    const adminAssignment = await prisma.userRole.findFirst({
      where: {
        userId,
        role: { name: 'admin' },
      },
    })
    return Boolean(adminAssignment)
  } catch (error) {
    console.error('Error checking local admin role:', error)
    captureError(error, {
      location: 'auth',
      type: 'check_local_admin_error',
      extra: { userId },
    })
    return false
  }
}

async function ensureAdminRoleAssignment(userId: string) {
  try {
    await ensureRolesExist()
    const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } })
    if (!adminRole) return
    const existing = await prisma.userRole.findFirst({
      where: { userId, roleId: adminRole.id },
    })
    if (!existing) {
      await prisma.userRole.create({
        data: { userId, roleId: adminRole.id },
      })
    }
  } catch (error) {
    console.error('Error ensuring admin role assignment:', error)
    captureError(error, {
      location: 'auth',
      type: 'ensure_admin_assignment_error',
      extra: { userId },
    })
  }
}

async function saveUserRole(username: string, role: AppRole) {
  try {
    // Ensure roles exist
    await ensureRolesExist()

    // Get the role ID
    const roleRecord = await prisma.role.findUnique({
      where: { name: role },
    })

    if (!roleRecord) {
      console.error(`Role ${role} not found in database`)
      captureError(new Error(`Role ${role} not found in database`), {
        location: 'auth',
        type: 'role_not_found',
        extra: { username, role },
      })
      return
    }

    // Swap the directory-derived role in one transaction. Done as separate
    // statements, two concurrent sign-ins could interleave the delete and the
    // create and leave the user with no role at all, or with two.
    await prisma.$transaction(async tx => {
      // Remove only non-admin role assignments so local admin stays additive.
      await tx.userRole.deleteMany({
        where: {
          userId: username,
          role: {
            name: {
              in: ['teacher', 'student', 'user'],
            },
          },
        },
      })

      await tx.userRole.create({
        data: {
          userId: username,
          roleId: roleRecord.id,
        },
      })
    })
  } catch (error) {
    console.error('Error saving user role:', error)
    captureError(error, {
      location: 'auth',
      type: 'save_user_role_error',
      extra: { username, role },
    })
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.ENTRA_CLIENT_ID!,
      clientSecret: process.env.ENTRA_CLIENT_SECRET!,
      tenantId: process.env.ENTRA_TENANT_ID,
      authorization: {
        params: {
          scope: 'openid profile email',
        },
      },
      // Use Entra Object ID (oid) as the stable user identifier so it matches
      // ENTRA_SUPER_ADMIN_OBJECT_ID and the external key used for sync.
      profile(profile) {
        const entraProfile = profile as {
          oid?: string
          sub?: string
          name?: string
          email?: string
          preferred_username?: string
          given_name?: string
          family_name?: string
        }

        const displayName = entraProfile.name?.trim() ?? ''
        let firstName = entraProfile.given_name?.trim() ?? null
        let lastName = entraProfile.family_name?.trim() ?? null

        // Entra sometimes omits given_name/family_name from the id_token even
        // with the `profile` scope (depends on tenant config and user profile
        // population). Fall back to splitting the display name so the UI still
        // shows something meaningful.
        if (!firstName && !lastName && displayName) {
          const parts = displayName.split(/\s+/).filter(Boolean)
          if (parts.length === 1) {
            firstName = parts[0] ?? null
          } else if (parts.length > 1) {
            firstName = parts[0] ?? null
            lastName = parts.slice(1).join(' ') || null
          }
        } else if (!firstName && displayName) {
          // Only `given_name` is missing, so `displayName` still contains the
          // surname we already have. Assigning it wholesale produced
          // "Anna Müller Müller"; strip the known surname off the end instead.
          firstName =
            lastName && displayName.endsWith(lastName)
              ? displayName.slice(0, -lastName.length).trim() || displayName
              : displayName
        }

        return {
          id: entraProfile.oid ?? entraProfile.sub ?? '',
          name: displayName || null,
          email: entraProfile.email ?? entraProfile.preferred_username ?? null,
          image: null,
          firstName,
          lastName,
        } as User & { firstName: string | null; lastName: string | null }
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // `profile()` maps the Entra object id onto user.id, which is also what
      // the app stores as externalId, so it is the identifier Graph is queried
      // with. The result is memoised, so the jwt callback that runs next reuses
      // this decision instead of hitting Graph a second time.
      const objectId = user?.id?.trim()
      if (!objectId) {
        return false
      }

      try {
        const { allowed } = await resolveMicrosoftAccess(objectId)
        return allowed
      } catch (error) {
        console.error('Error validating Microsoft group access:', error)
        captureError(error, {
          location: 'auth',
          type: 'azure_ad_access_validation_error',
        })
        return false
      }
    },
    async jwt({ token, user, account }) {
      const isSignIn = account?.provider === 'azure-ad'

      if (isSignIn) {
        if (user) {
          const msUser = user as User & { firstName?: string | null; lastName?: string | null }
          if (msUser.firstName !== undefined) {
            token.firstName = msUser.firstName
          }
          if (msUser.lastName !== undefined) {
            token.lastName = msUser.lastName
          }
        }
        token.provider = 'azure-ad'
      }

      // A token minted by the retired LDAP provider carries no `provider` and a
      // username rather than an Entra object id in `sub`, so its role cannot be
      // re-resolved against Graph. Strip it to the powerless `user` role instead
      // of leaving a 30-day session running on a role nothing can revoke.
      // Rotating NEXTAUTH_SECRET at cutover is the belt to this braces.
      if (token.provider !== 'azure-ad') {
        token.role = 'user'
        return token
      }

      // Roles used to be resolved only when `account` was present, i.e. only at
      // sign-in. With a 30-day JWT that meant a teacher removed from the Entra
      // group kept their access for a month. Re-resolve on a timer instead;
      // `resolveMicrosoftAccess` is app-only so it needs no user access token.
      const objectId = typeof token.sub === 'string' ? token.sub.trim() : ''
      const lastChecked = typeof token.accessCheckedAt === 'number' ? token.accessCheckedAt : 0
      const isStale = Date.now() - lastChecked > ACCESS_CACHE_TTL_MS
      const shouldResolve = Boolean(objectId) && (isSignIn || isStale)

      if (shouldResolve) {
        try {
          const accessResult = await resolveMicrosoftAccess(objectId)
          token.role = accessResult.role
          token.accessCheckedAt = Date.now()

          const jwtToken = token as typeof token & { preferred_username?: string }
          const roleUserId = normalizeUsername(
            String(token.email ?? jwtToken.preferred_username ?? token.name ?? token.sub ?? ''),
          )
          if (roleUserId) {
            await saveUserRole(roleUserId, accessResult.role)

            // Super admin (Entra Object ID) is always an admin; auto-grant on login.
            const superAdminObjectId = process.env.ENTRA_SUPER_ADMIN_OBJECT_ID?.trim()
            if (superAdminObjectId && superAdminObjectId === objectId) {
              await ensureAdminRoleAssignment(roleUserId)
            }

            // Promote session role to admin if local additive admin is present.
            if (await hasLocalAdminRole(roleUserId)) {
              token.role = 'admin'
            }
          }
        } catch (error) {
          console.error('Error resolving Microsoft group membership:', error)
          captureError(error, {
            location: 'auth',
            type: 'azure_ad_groups_error',
            extra: { userId: token.sub },
          })
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub
        session.user.role = token.role as 'admin' | 'teacher' | 'student'
        session.user.firstName = token.firstName as string | null
        session.user.lastName = token.lastName as string | null
        // Normalize name for teacher/student lookups (e.g. firstname.lastname, email/UPN)
        session.user.name = normalizeUsername(
          session.user.name ?? session.user.email ?? token.sub ?? '',
        )
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}

export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const userRole = await prisma.userRole.findFirst({
      where: {
        userId,
        role: {
          name: roleName,
        },
      },
    })
    return !!userRole
  } catch (error) {
    console.error('Error checking user role:', error)
    captureError(error, {
      location: 'auth',
      type: 'check_role_error',
      extra: { userId, roleName },
    })
    return false
  }
}

export async function getUserRoles(userId: string): Promise<string[]> {
  try {
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
      },
      include: {
        role: true,
      },
    })
    return userRoles.map(ur => ur.role.name)
  } catch (error) {
    console.error('Error getting user roles:', error)
    captureError(error, {
      location: 'auth',
      type: 'get_user_roles_error',
      extra: { userId },
    })
    return []
  }
}

export async function requireRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const hasRequiredRole = await hasRole(userId, roleName)
    if (!hasRequiredRole) {
      const error = new Error(`User does not have required role: ${roleName}`)
      captureError(error, {
        location: 'auth',
        type: 'missing_required_role',
        extra: { userId, roleName },
      })
      throw error
    }
    return true
  } catch (error) {
    if (error instanceof Error && error.message.includes('required role')) {
      throw error
    }
    captureError(error, {
      location: 'auth',
      type: 'require_role_error',
      extra: { userId, roleName },
    })
    throw error
  }
}
