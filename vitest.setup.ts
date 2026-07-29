import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Route handlers call `denyUnlessAccess` (see src/lib/api-guard.ts), which
 * reaches for `next/headers` and therefore needs a real request scope. Route
 * unit tests exercise handler logic rather than authorisation, so the guard is
 * mocked to "allowed" globally.
 *
 * Authorisation itself is covered by src/lib/__tests__/api-access.test.ts and
 * src/app/api/__tests__/route-guards.test.ts, which assert the policy table and
 * that every handler is actually wired to it. A test that needs the real guard
 * can opt back in with `vi.unmock('@/lib/api-guard')`.
 */
vi.mock('@/lib/api-guard', () => ({
  denyUnlessAccess: vi.fn(async () => null),
  withSession: (handler: unknown) => handler,
  withStaff: (handler: unknown) => handler,
  withAdmin: (handler: unknown) => handler,
}));

// Automatically cleanup after each test
afterEach(() => {
  cleanup();
});
