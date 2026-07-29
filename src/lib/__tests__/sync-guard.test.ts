import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_DEACTIVATION_RATIO,
  MassDeactivationError,
  assertDeactivationWithinLimit,
  resolveMaxDeactivationRatio,
} from '@/lib/sync-guard'

describe('assertDeactivationWithinLimit', () => {
  it('allows a deactivation count at or below the limit', () => {
    expect(() =>
      assertDeactivationWithinLimit({
        scope: 'students',
        deactivating: 20,
        activeBefore: 100,
        limit: 0.2,
      }),
    ).not.toThrow()
  })

  it('refuses a run that would retire an implausible share', () => {
    expect(() =>
      assertDeactivationWithinLimit({
        scope: 'students',
        deactivating: 95,
        activeBefore: 100,
        limit: 0.2,
      }),
    ).toThrow(MassDeactivationError)
  })

  it('reports the numbers that triggered the refusal', () => {
    try {
      assertDeactivationWithinLimit({
        scope: 'students',
        deactivating: 95,
        activeBefore: 100,
        limit: 0.2,
      })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(MassDeactivationError)
      const massError = error as MassDeactivationError
      expect(massError.deactivating).toBe(95)
      expect(massError.activeBefore).toBe(100)
      expect(massError.scope).toBe('students')
      expect(massError.message).toContain('95 of 100')
    }
  })

  it('catches the empty-group case that motivates the guard', () => {
    expect(() =>
      assertDeactivationWithinLimit({
        scope: 'students',
        deactivating: 800,
        activeBefore: 800,
        limit: DEFAULT_MAX_DEACTIVATION_RATIO,
      }),
    ).toThrow(MassDeactivationError)
  })

  it('passes when nothing is being deactivated', () => {
    expect(() =>
      assertDeactivationWithinLimit({
        scope: 'students',
        deactivating: 0,
        activeBefore: 0,
        limit: 0,
      }),
    ).not.toThrow()
  })

  it('passes on an empty starting set rather than dividing by zero', () => {
    expect(() =>
      assertDeactivationWithinLimit({
        scope: 'students',
        deactivating: 3,
        activeBefore: 0,
        limit: 0.2,
      }),
    ).not.toThrow()
  })

  it('can be disabled with a null limit', () => {
    expect(() =>
      assertDeactivationWithinLimit({
        scope: 'students',
        deactivating: 800,
        activeBefore: 800,
        limit: null,
      }),
    ).not.toThrow()
  })
})

describe('resolveMaxDeactivationRatio', () => {
  afterEach(() => {
    delete process.env.SYNC_MAX_DEACTIVATION_RATIO
  })

  it('defaults when unset', () => {
    expect(resolveMaxDeactivationRatio()).toBe(DEFAULT_MAX_DEACTIVATION_RATIO)
  })

  it('reads a configured fraction', () => {
    process.env.SYNC_MAX_DEACTIVATION_RATIO = '0.5'
    expect(resolveMaxDeactivationRatio()).toBe(0.5)
  })

  it('accepts 0, which refuses any deactivation at all', () => {
    process.env.SYNC_MAX_DEACTIVATION_RATIO = '0'
    expect(resolveMaxDeactivationRatio()).toBe(0)
  })

  it('falls back rather than disabling the guard on a bad value', () => {
    for (const bad of ['not-a-number', '-1', '5', '']) {
      process.env.SYNC_MAX_DEACTIVATION_RATIO = bad
      expect(resolveMaxDeactivationRatio()).toBe(DEFAULT_MAX_DEACTIVATION_RATIO)
    }
  })
})
