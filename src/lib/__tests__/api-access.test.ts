import { describe, expect, it } from 'vitest'
import {
  API_ACCESS_RULES,
  DEFAULT_API_TIER,
  resolveAccessTier,
  satisfiesTier,
} from '@/lib/api-access'

describe('resolveAccessTier', () => {
  it('defaults unknown routes to staff so new endpoints are not public by accident', () => {
    expect(resolveAccessTier('/api/some/brand/new/thing', 'GET')).toBe('staff')
    expect(DEFAULT_API_TIER).toBe('staff')
  })

  it('keeps NextAuth reachable while signed out', () => {
    expect(resolveAccessTier('/api/auth/session', 'GET')).toBe('public')
    expect(resolveAccessTier('/api/auth/callback/azure-ad', 'POST')).toBe('public')
  })

  it('locks the generic CRUD endpoint to admins', () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      expect(resolveAccessTier('/api/admin/data', method)).toBe('admin')
    }
  })

  it('leaves schedule and break times at staff, since they are edited during schedule creation', () => {
    expect(resolveAccessTier('/api/admin/settings/schedule-times', 'POST')).toBe('staff')
    expect(resolveAccessTier('/api/admin/settings/break-times', 'GET')).toBe('staff')
  })

  it('matches the more specific admin rule before the generic one', () => {
    expect(resolveAccessTier('/api/admin/entra/groups', 'GET')).toBe('admin')
    expect(resolveAccessTier('/api/admin/student-photos/upload', 'POST')).toBe('staff')
    expect(resolveAccessTier('/api/admin/student-photos/o365-refresh', 'POST')).toBe('admin')
  })

  it('lets students read their own schedule but not write one', () => {
    expect(resolveAccessTier('/api/schedules', 'GET')).toBe('session')
    expect(resolveAccessTier('/api/schedules', 'POST')).toBe('staff')
    expect(resolveAccessTier('/api/students/class', 'GET')).toBe('session')
    expect(resolveAccessTier('/api/students', 'GET')).toBe('staff')
  })

  it('treats role administration as admin-only', () => {
    expect(resolveAccessTier('/api/roles', 'GET')).toBe('admin')
    expect(resolveAccessTier('/api/user-roles', 'DELETE')).toBe('admin')
  })

  it('is case insensitive about the HTTP method', () => {
    expect(resolveAccessTier('/api/schedules', 'get')).toBe('session')
  })

  it('never leaves a rule shadowed by an earlier, broader prefix', () => {
    API_ACCESS_RULES.forEach((rule, index) => {
      const shadowedBy = API_ACCESS_RULES.slice(0, index).find(
        earlier =>
          rule.prefix.startsWith(earlier.prefix) && earlier.tier !== rule.tier && !earlier.methods,
      )
      expect(
        shadowedBy,
        `${rule.prefix} is unreachable: ${shadowedBy?.prefix} matches first`,
      ).toBeUndefined()
    })
  })
})

describe('satisfiesTier', () => {
  const cases: Array<[Parameters<typeof satisfiesTier>[0], unknown, boolean, boolean]> = [
    ['public', undefined, false, true],
    ['session', undefined, false, false],
    ['session', 'student', true, true],
    ['staff', 'student', true, false],
    ['staff', 'teacher', true, true],
    ['staff', 'admin', true, true],
    ['admin', 'teacher', true, false],
    ['admin', 'admin', true, true],
  ]

  it.each(cases)('tier %s with role %s -> %s', (tier, role, hasSession, expected) => {
    expect(satisfiesTier(tier, role, hasSession)).toBe(expected)
  })
})
