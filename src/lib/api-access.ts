/**
 * Central access policy for the `/api` surface.
 *
 * Route handlers historically carried no auth of their own while
 * `middleware.ts` skipped `/api` entirely, which left the whole API open. The
 * table below is the single place that decides who may reach which endpoint;
 * it is consumed by the edge middleware (outer net) and by the `withX`
 * wrappers in `api-guard.ts` (defence in depth inside the handler).
 *
 * Anything not matched by a rule falls back to {@link DEFAULT_API_TIER}, so a
 * newly added route is protected by default rather than public by default.
 */

export type AccessTier = 'public' | 'session' | 'staff' | 'admin'

export const DEFAULT_API_TIER: AccessTier = 'staff'

export interface ApiAccessRule {
  /** Path prefix, matched against the request pathname. */
  prefix: string
  tier: AccessTier
  /** When set, the rule only applies to these HTTP methods. */
  methods?: readonly string[]
}

/**
 * Ordered most-specific-first; the first matching rule wins.
 */
export const API_ACCESS_RULES: readonly ApiAccessRule[] = [
  // NextAuth's own endpoints must stay reachable while signed out.
  { prefix: '/api/auth', tier: 'public' },
  // Public release metadata rendered in the header for signed-out visitors.
  { prefix: '/api/github/releases', tier: 'public' },
  // Container healthcheck and the deploy workflow's rollout gate, both of which
  // run before any session exists. Reports liveness only, never configuration.
  { prefix: '/api/health', tier: 'public', methods: ['GET'] },

  // Schedule times and break times are edited during schedule creation, which
  // is a teacher task despite the endpoints living under /api/admin.
  { prefix: '/api/admin/settings', tier: 'staff' },
  { prefix: '/api/admin/grades', tier: 'staff' },
  { prefix: '/api/admin/student-photos/upload', tier: 'staff' },
  { prefix: '/api/admin', tier: 'admin' },

  // Role administration.
  { prefix: '/api/roles', tier: 'admin' },
  { prefix: '/api/user-roles', tier: 'admin' },

  // Reachable by any signed-in user, including students.
  { prefix: '/api/entitlements', tier: 'session' },
  { prefix: '/api/me', tier: 'session' },
  { prefix: '/api/support', tier: 'session' },
  { prefix: '/api/school-years', tier: 'session', methods: ['GET'] },
  { prefix: '/api/students/class', tier: 'session', methods: ['GET'] },
  { prefix: '/api/students/photo', tier: 'session', methods: ['GET'] },
  { prefix: '/api/teachers/photo', tier: 'session', methods: ['GET'] },
  // Combining two classes into one is part of schedule creation, a teacher task.
  // Listed before the /api/classes admin rule below, which would otherwise catch it.
  { prefix: '/api/classes/combine', tier: 'staff', methods: ['POST'] },
  { prefix: '/api/classes', tier: 'session', methods: ['GET'] },
  // Writing a class — in practice its Klassenvorstand/Klassenleiter — is an
  // administrative act. It used to be open to any teacher, which let anyone make
  // themselves class lead and from there mark the class as entered into Sokrates
  // and freeze every colleague's grades. Ordered after the GET rule above so
  // reads stay open to any signed-in user.
  { prefix: '/api/classes', tier: 'admin' },
  // Students read their own class schedule from the home page overview.
  { prefix: '/api/schedules', tier: 'session', methods: ['GET'] },

  // Unattended directory sync, authenticated by a shared secret header rather
  // than a session (see api/admin/sync/run). Declared public here so the
  // session check does not reject the cron caller; the handler enforces the
  // secret itself.
  { prefix: '/api/sync/run', tier: 'public' },
  // Unattended notification e-mail digest, same shared-secret model as the sync
  // trigger above (issue #96). Public only so the cron caller is not rejected by
  // the session check; the handler verifies the secret itself. Listed before the
  // default so it wins over the staff tier the rest of /api/notifications uses.
  { prefix: '/api/notifications/digest/run', tier: 'public' },
]

/**
 * Resolves the access tier required for a request.
 */
export function resolveAccessTier(pathname: string, method: string): AccessTier {
  const normalizedMethod = method.toUpperCase()

  for (const rule of API_ACCESS_RULES) {
    if (!pathname.startsWith(rule.prefix)) continue
    if (rule.methods && !rule.methods.includes(normalizedMethod)) continue
    return rule.tier
  }

  return DEFAULT_API_TIER
}

export function isStaffRole(role: unknown): boolean {
  return role === 'teacher' || role === 'admin'
}

export function satisfiesTier(tier: AccessTier, role: unknown, hasSession: boolean): boolean {
  switch (tier) {
    case 'public':
      return true
    case 'session':
      return hasSession
    case 'staff':
      return hasSession && isStaffRole(role)
    case 'admin':
      return hasSession && role === 'admin'
  }
}
