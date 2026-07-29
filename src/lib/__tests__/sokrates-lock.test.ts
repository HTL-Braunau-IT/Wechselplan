import { describe, expect, it } from 'vitest'
import { isEditBlocked, isFinalGradeEditBlocked, type SokratesStatus } from '@/lib/sokrates-lock'

const status = (overrides: Partial<SokratesStatus>): SokratesStatus => ({
  first: {
    marked: false,
    markedAt: null,
    markedByName: null,
    lockedAll: false,
    lockedTeacherIds: [],
    transferId: null,
  },
  second: {
    marked: false,
    markedAt: null,
    markedByName: null,
    lockedAll: false,
    lockedTeacherIds: [],
    transferId: null,
  },
  ...overrides,
})

describe('isEditBlocked', () => {
  it('never blocks when the semester is not marked', () => {
    const s = status({
      // lockedAll set but marked=false — a lock without a mark cannot happen in
      // practice, and must not block either way.
      first: {
        marked: false,
        markedAt: null,
        markedByName: null,
        lockedAll: true,
        lockedTeacherIds: [42],
        transferId: null,
      },
    })
    expect(isEditBlocked(s, 'first', 42, false)).toBe(false)
  })

  it('does not block a marked-but-unlocked (soft) semester', () => {
    const s = status({
      first: {
        marked: true,
        markedAt: '2026-02-01T00:00:00.000Z',
        markedByName: 'A B',
        lockedAll: false,
        lockedTeacherIds: [],
        transferId: 1,
      },
    })
    expect(isEditBlocked(s, 'first', 42, false)).toBe(false)
  })

  it('blocks every column when the whole class is hard-locked', () => {
    const s = status({
      first: {
        marked: true,
        markedAt: '2026-02-01T00:00:00.000Z',
        markedByName: 'A B',
        lockedAll: true,
        lockedTeacherIds: [],
        transferId: 1,
      },
    })
    expect(isEditBlocked(s, 'first', 42, false)).toBe(true)
    expect(isEditBlocked(s, 'first', 7, false)).toBe(true)
  })

  it('blocks only the named columns for a per-subject lock', () => {
    const s = status({
      first: {
        marked: true,
        markedAt: '2026-02-01T00:00:00.000Z',
        markedByName: 'A B',
        lockedAll: false,
        lockedTeacherIds: [42],
        transferId: 1,
      },
    })
    expect(isEditBlocked(s, 'first', 42, false)).toBe(true)
    expect(isEditBlocked(s, 'first', 7, false)).toBe(false)
  })

  it('lets the class lead or admin override any lock', () => {
    const s = status({
      first: {
        marked: true,
        markedAt: '2026-02-01T00:00:00.000Z',
        markedByName: 'A B',
        lockedAll: true,
        lockedTeacherIds: [42],
        transferId: 1,
      },
    })
    expect(isEditBlocked(s, 'first', 42, true)).toBe(false)
  })

  it('is scoped per semester', () => {
    const s = status({
      first: {
        marked: true,
        markedAt: '2026-02-01T00:00:00.000Z',
        markedByName: 'A B',
        lockedAll: true,
        lockedTeacherIds: [],
        transferId: 1,
      },
    })
    // second semester untouched → editable
    expect(isEditBlocked(s, 'second', 42, false)).toBe(false)
  })
})

describe('isFinalGradeEditBlocked', () => {
  const marked = (overrides: Partial<SokratesStatus['first']> = {}) =>
    status({
      first: {
        marked: true,
        markedAt: '2026-02-01T00:00:00.000Z',
        markedByName: 'A B',
        lockedAll: false,
        lockedTeacherIds: [],
        transferId: 1,
        ...overrides,
      },
    })

  it('blocks the Zeugnisnote when the whole semester is locked', () => {
    expect(isFinalGradeEditBlocked(marked({ lockedAll: true }), 'first', false)).toBe(true)
  })

  it('does not block a marked-but-unlocked (soft) semester', () => {
    expect(isFinalGradeEditBlocked(marked(), 'first', false)).toBe(false)
  })

  it('ignores per-subject locks — the final grade has no teacher column', () => {
    expect(isFinalGradeEditBlocked(marked({ lockedTeacherIds: [42] }), 'first', false)).toBe(false)
  })

  it('never blocks an unmarked semester', () => {
    expect(isFinalGradeEditBlocked(marked({ lockedAll: true }), 'second', false)).toBe(false)
  })

  it('lets the class lead or admin override', () => {
    expect(isFinalGradeEditBlocked(marked({ lockedAll: true }), 'first', true)).toBe(false)
  })
})
