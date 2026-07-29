import { describe, expect, it, vi } from 'vitest'

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => {
    const client = { $extends: () => client }
    return client
  }),
}))

const { ANY_ACTIVE_STATE, shouldDefaultToActive } = await import('@/lib/prisma')

describe('shouldDefaultToActive', () => {
  it('filters list reads on the soft-deleted models', () => {
    for (const model of ['Student', 'Teacher', 'Class']) {
      expect(shouldDefaultToActive(model, 'findMany', undefined)).toBe(true)
      expect(shouldDefaultToActive(model, 'findFirst', {})).toBe(true)
      expect(shouldDefaultToActive(model, 'count', { classId: 1 })).toBe(true)
    }
  })

  it('leaves models without a lifecycle alone', () => {
    expect(shouldDefaultToActive('Schedule', 'findMany', undefined)).toBe(false)
    expect(shouldDefaultToActive('Grade', 'findMany', undefined)).toBe(false)
    expect(shouldDefaultToActive(undefined, 'findMany', undefined)).toBe(false)
  })

  it('does not touch writes', () => {
    for (const operation of ['create', 'update', 'updateMany', 'upsert', 'delete']) {
      expect(shouldDefaultToActive('Student', operation, undefined)).toBe(false)
    }
  })

  it('leaves findUnique alone, since a primary-key lookup is explicit', () => {
    expect(shouldDefaultToActive('Student', 'findUnique', undefined)).toBe(false)
    expect(shouldDefaultToActive('Student', 'findUniqueOrThrow', undefined)).toBe(false)
  })

  it('yields to an explicit isActive in the caller where', () => {
    expect(shouldDefaultToActive('Student', 'findMany', { isActive: false })).toBe(false)
    expect(shouldDefaultToActive('Student', 'findMany', { isActive: true })).toBe(false)
  })

  it('treats ANY_ACTIVE_STATE as an opt-out', () => {
    expect(shouldDefaultToActive('Student', 'findMany', { isActive: ANY_ACTIVE_STATE })).toBe(false)
    expect(shouldDefaultToActive('Class', 'findMany', { isActive: ANY_ACTIVE_STATE })).toBe(false)
  })

  it('keeps ANY_ACTIVE_STATE free of SQL-level constraints', () => {
    // Prisma strips undefined members, so this must not narrow the result set.
    expect(Object.values(ANY_ACTIVE_STATE).every(value => value === undefined)).toBe(true)
  })
})
