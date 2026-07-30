import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * Route handlers call `denyUnlessAccess` / `requireAccess` (see
 * src/lib/api-guard.ts), which reach for `next/headers` and therefore need a
 * real request scope. Route unit tests exercise handler logic rather than
 * authorisation, so the guard is mocked to "allowed" globally.
 *
 * `requireAccess` still resolves the session through `getServerSession`, so a
 * test that mocks `next-auth` continues to drive which user the handler sees —
 * exactly as it did when handlers called `getServerSession` themselves.
 *
 * Authorisation itself is covered by src/lib/__tests__/api-access.test.ts and
 * src/app/api/__tests__/route-guards.test.ts, which assert the policy table and
 * that every handler is actually wired to it. A test that needs the real guard
 * can opt back in with `vi.unmock('@/lib/api-guard')`.
 */
vi.mock('@/lib/api-guard', async () => {
  const { getServerSession } = await import('next-auth')
  return {
    denyUnlessAccess: vi.fn(async () => null),
    requireAccess: vi.fn(async () => ({ ok: true, session: await getServerSession() })),
  }
})

/**
 * `captureError` persists to the ErrorLog table best-effort and fire-and-forget
 * (see src/lib/sentry.ts -> src/lib/error-log.ts). In tests that would fire
 * async DB writes against a mocked/absent Prisma after the handler returns,
 * bleeding console noise and non-determinism into later tests. Stub the sink to
 * a no-op so `captureError` stays real (call assertions still work) without any
 * persistence. A test for the sink itself can `vi.unmock('@/lib/error-log')`.
 */
vi.mock('@/lib/error-log', () => ({
  recordError: vi.fn(async () => undefined),
  redactContext: (context: Record<string, unknown> | null | undefined) => context ?? null,
  dedupeKey: () => 'test-dedupe-key',
  pruneErrorLogs: vi.fn(async () => 0),
}))

// Automatically cleanup after each test
afterEach(() => {
  cleanup()
})
