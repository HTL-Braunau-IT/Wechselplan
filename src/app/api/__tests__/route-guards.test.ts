import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAccessTier } from '@/lib/api-access'

/**
 * Regression test for the API being reachable without a session.
 *
 * `middleware.ts` is the outer net, but a matcher change or a route that opts
 * out of middleware would silently remove it. Every exported route handler must
 * therefore also guard itself, either with `denyUnlessAccess`, one of the
 * `withX` wrappers, or the older `requireAdmin` call.
 */

const API_DIR = path.resolve(__dirname, '..')

/** Route handlers whose access is enforced by something other than the guards. */
const EXEMPT = new Map<string, string>([
  ['/api/auth/[...nextauth]', 'NextAuth owns this route entirely'],
  ['/api/trpc/[trpc]', 'authorisation lives in the tRPC procedure middleware'],
  ['/api/github/releases', 'public release metadata, shown to signed-out visitors'],
  ['/api/sync/run', 'authenticated by a shared secret header, not a session'],
  ['/api/notifications/digest/run', 'authenticated by a shared secret header, not a session'],
])

const GUARD_PATTERNS = [
  /denyUnlessAccess\s*\(/,
  /\bwith(Session|Staff|Admin)\s*\(/,
  /requireAdmin\s*\(/,
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') walk(full, out)
    } else if (entry.name === 'route.ts') {
      out.push(full)
    }
  }
  return out
}

function routePath(file: string): string {
  return '/api/' + path.relative(API_DIR, path.dirname(file)).split(path.sep).join('/')
}

const routeFiles = walk(API_DIR)

describe('API route guards', () => {
  it('finds route handlers to check', () => {
    expect(routeFiles.length).toBeGreaterThan(50)
  })

  it.each(routeFiles.map(file => [routePath(file), file]))(
    '%s guards every exported handler',
    (route, file) => {
      if (EXEMPT.has(route)) return

      const source = fs.readFileSync(file, 'utf8')
      const handlers = [
        ...source.matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g),
      ]
      if (handlers.length === 0) return

      const guarded = GUARD_PATTERNS.some(pattern => pattern.test(source))
      expect(guarded, `${route} exports handlers but calls no access guard`).toBe(true)

      // The declared tier must be one the policy table actually knows about,
      // i.e. the route is not relying on the fallback by accident.
      for (const handler of handlers) {
        expect(['public', 'session', 'staff', 'admin']).toContain(
          resolveAccessTier(route, handler[1]!),
        )
      }
    },
  )

  it('does not leave any handler on a weaker tier than the policy table requires', () => {
    const violations: string[] = []

    for (const file of routeFiles) {
      const route = routePath(file)
      if (EXEMPT.has(route)) continue

      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(
        /denyUnlessAccess\(\s*'(public|session|staff|admin)'\s*\)/g,
      )) {
        const declared = match[1]!
        // Find which methods this file exports so we can compare against policy.
        const methods = [
          ...source.matchAll(
            /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g,
          ),
        ].map(m => m[1]!)
        const required = methods.map(m => resolveAccessTier(route, m))
        const order = ['public', 'session', 'staff', 'admin']
        if (
          required.length > 0 &&
          order.indexOf(declared) < Math.min(...required.map(r => order.indexOf(r)))
        ) {
          violations.push(
            `${route}: guards at '${declared}' but policy requires '${required.join('/')}'`,
          )
        }
      }
    }

    expect(violations).toEqual([])
  })
})
