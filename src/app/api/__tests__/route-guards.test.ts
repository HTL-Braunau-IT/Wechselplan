import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAccessTier } from '@/lib/api-access'

/**
 * Regression test for the API being reachable without a session.
 *
 * `middleware.ts` is the outer net, but a matcher change or a route that opts
 * out of middleware would silently remove it. Every exported route handler must
 * therefore also guard itself, with `denyUnlessAccess`, `requireAccess`, or the
 * `requireAdmin` call.
 */

const API_DIR = path.resolve(__dirname, '..')

/** Route handlers whose access is enforced by something other than the guards. */
const EXEMPT = new Map<string, string>([
  ['/api/auth/[...nextauth]', 'NextAuth owns this route entirely'],
  ['/api/github/releases', 'public release metadata, shown to signed-out visitors'],
  ['/api/sync/run', 'authenticated by a shared secret header, not a session'],
  ['/api/notifications/digest/run', 'authenticated by a shared secret header, not a session'],
])

const GUARD_PATTERNS = [/denyUnlessAccess\s*\(/, /requireAccess\s*\(/, /requireAdmin\s*\(/]

const HANDLER_RE = /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g

const TIER_ORDER = ['public', 'session', 'staff', 'admin'] as const

/**
 * Splits a route file into one slice per exported handler: from that handler's
 * `export` keyword to the next handler's (or EOF). Lets each handler be checked
 * individually instead of trusting that *some* guard appears anywhere in the
 * file — a file with two handlers could otherwise pass on one guard (findings
 * 33 & 37).
 */
function handlerSlices(source: string): Array<{ method: string; body: string }> {
  const matches = [...source.matchAll(HANDLER_RE)]
  return matches.map((m, i) => ({
    method: m[1]!,
    body: source.slice(m.index!, i + 1 < matches.length ? matches[i + 1]!.index! : source.length),
  }))
}

/** The tier a handler body declares, or null when no inline tier is present. */
function declaredTier(body: string): string | null {
  if (/requireAdmin\s*\(/.test(body)) return 'admin'
  const m = body.match(/(?:denyUnlessAccess|requireAccess)\(\s*'(public|session|staff|admin)'\s*\)/)
  return m ? m[1]! : null
}

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
    '%s guards every exported handler individually',
    (route, file) => {
      if (EXEMPT.has(route)) return

      const source = fs.readFileSync(file, 'utf8')
      const handlers = handlerSlices(source)
      if (handlers.length === 0) return

      for (const { method, body } of handlers) {
        // Each handler body must itself call an access guard — not merely share a
        // file with one.
        const guarded = GUARD_PATTERNS.some(pattern => pattern.test(body))
        expect(guarded, `${route} ${method} exports a handler but calls no access guard`).toBe(true)

        // The declared tier must be one the policy table actually knows about,
        // i.e. the route is not relying on the fallback by accident.
        expect(['public', 'session', 'staff', 'admin']).toContain(resolveAccessTier(route, method))
      }
    },
  )

  it('does not leave any handler on a weaker tier than the policy table requires', () => {
    const violations: string[] = []

    for (const file of routeFiles) {
      const route = routePath(file)
      if (EXEMPT.has(route)) continue

      const source = fs.readFileSync(file, 'utf8')
      // Compare EACH handler's own declared tier against the policy tier for THAT
      // method — not against the file-wide minimum, which let a higher-tier write
      // in a mixed-tier file be under-guarded at the read tier (findings 33 & 37).
      for (const { method, body } of handlerSlices(source)) {
        const declared = declaredTier(body)
        if (declared == null) continue
        const required = resolveAccessTier(route, method)
        if (TIER_ORDER.indexOf(declared as (typeof TIER_ORDER)[number]) < TIER_ORDER.indexOf(required)) {
          violations.push(
            `${route} ${method}: guards at '${declared}' but policy requires '${required}'`,
          )
        }
      }
    }

    expect(violations).toEqual([])
  })
})
