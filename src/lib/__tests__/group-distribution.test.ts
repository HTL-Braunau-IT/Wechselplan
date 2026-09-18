import { describe, it, expect } from 'vitest'
import {
  distributeStudentsEvenly,
  checkGroupSizes,
  ensureUnassignedGroup,
  adjustGroupCount,
  renumberGroups,
  UNASSIGNED_GROUP_ID,
} from '@/lib/group-distribution'

type S = { id: number; lastName: string }

const mk = (n: number): S[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, lastName: String.fromCharCode(90 - i) }))

describe('distributeStudentsEvenly', () => {
  it('splits students evenly with the unassigned group first', () => {
    const groups = distributeStudentsEvenly(mk(7), 3)
    expect(groups[0]!.id).toBe(UNASSIGNED_GROUP_ID)
    const regular = groups.filter(g => g.id !== UNASSIGNED_GROUP_ID)
    expect(regular.map(g => g.id)).toEqual([1, 2, 3])
    // 7 across 3 → sizes 3,2,2 (largest−smallest ≤ 1)
    const sizes = regular.map(g => g.students.length).sort((a, b) => b - a)
    expect(sizes).toEqual([3, 2, 2])
    expect(sizes[0]! - sizes[sizes.length - 1]!).toBeLessThanOrEqual(1)
  })

  it('sorts students by last name', () => {
    const groups = distributeStudentsEvenly(mk(4), 2)
    const firstNames = groups[1]!.students.map(s => s.lastName)
    expect([...firstNames].sort()).toEqual(firstNames)
  })

  describe('class-true distribution (combined classes)', () => {
    type CS = { id: number; lastName: string; cls: string }
    const mkc = (cls: string, n: number, from = 0): CS[] =>
      Array.from({ length: n }, (_, i) => ({
        id: from + i + 1,
        lastName: `${cls}-${String(i).padStart(2, '0')}`,
        cls,
      }))
    const key = (s: CS) => s.cls

    it('never mixes two classes in one group and packs toward maxSize', () => {
      // 22 + 21 across 5 groups, cap 12 → A:[11,11], B:[11,10], one empty group.
      const students = [...mkc('A', 22), ...mkc('B', 21, 22)]
      const groups = distributeStudentsEvenly(students, 5, { classKey: key, maxSize: 12 })
      const regular = groups.filter(g => g.id !== UNASSIGNED_GROUP_ID)
      expect(regular.map(g => g.id)).toEqual([1, 2, 3, 4, 5])
      // No group holds more than one class.
      for (const g of regular) {
        const classes = new Set(g.students.map(key))
        expect(classes.size).toBeLessThanOrEqual(1)
      }
      expect(regular.map(g => g.students.length)).toEqual([11, 11, 11, 10, 0])
    })

    it('leaves the extra groups empty rather than spreading a class thinner', () => {
      const students = [...mkc('A', 12), ...mkc('B', 12, 12)]
      const groups = distributeStudentsEvenly(students, 5, { classKey: key, maxSize: 12 })
      const sizes = groups.filter(g => g.id !== UNASSIGNED_GROUP_ID).map(g => g.students.length)
      expect(sizes).toEqual([12, 12, 0, 0, 0])
    })

    it('falls back to an even split for a single class', () => {
      const students = mkc('A', 7)
      const groups = distributeStudentsEvenly(students, 3, { classKey: key, maxSize: 12 })
      const sizes = groups
        .filter(g => g.id !== UNASSIGNED_GROUP_ID)
        .map(g => g.students.length)
        .sort((a, b) => b - a)
      expect(sizes).toEqual([3, 2, 2])
    })

    it('keeps classes pure even when groups are under-provisioned', () => {
      // 22 + 21 but only 3 groups: still no mixing (some groups exceed the cap,
      // which the size validation flags separately).
      const students = [...mkc('A', 22), ...mkc('B', 21, 22)]
      const groups = distributeStudentsEvenly(students, 3, { classKey: key, maxSize: 12 })
      const regular = groups.filter(g => g.id !== UNASSIGNED_GROUP_ID)
      expect(regular.length).toBe(3)
      for (const g of regular) {
        expect(new Set(g.students.map(key)).size).toBeLessThanOrEqual(1)
      }
    })
  })
})

describe('checkGroupSizes', () => {
  it('exempts the unassigned group but limits regular groups', () => {
    const groups = [
      { id: UNASSIGNED_GROUP_ID, students: mk(20) },
      { id: 1, students: mk(12) },
    ]
    expect(checkGroupSizes(groups, 12)).toBe(true)
    expect(checkGroupSizes([{ id: 1, students: mk(13) }], 12)).toBe(false)
  })
})

describe('ensureUnassignedGroup', () => {
  it('prepends the unassigned group when missing and is a no-op otherwise', () => {
    const without = [{ id: 1, students: [] as S[] }]
    expect(ensureUnassignedGroup(without)[0]!.id).toBe(UNASSIGNED_GROUP_ID)
    const withIt = [{ id: UNASSIGNED_GROUP_ID, students: [] as S[] }, { id: 1, students: [] as S[] }]
    expect(ensureUnassignedGroup(withIt)).toBe(withIt)
  })
})

describe('adjustGroupCount', () => {
  const base = [
    { id: UNASSIGNED_GROUP_ID, students: [] as S[] },
    { id: 1, students: mk(3) },
    { id: 2, students: mk(3) },
  ]

  it('appends empty groups when growing', () => {
    const grown = adjustGroupCount(base, 4, 12)
    expect(grown.filter(g => g.id !== UNASSIGNED_GROUP_ID).map(g => g.id)).toEqual([1, 2, 3, 4])
    expect(grown.find(g => g.id === 4)!.students).toEqual([])
    // originals untouched
    expect(grown.find(g => g.id === 1)!.students.length).toBe(3)
  })

  it('redistributes removed students into remaining groups when shrinking', () => {
    const shrunk = adjustGroupCount(base, 1, 12)
    const regular = shrunk.filter(g => g.id !== UNASSIGNED_GROUP_ID)
    expect(regular.map(g => g.id)).toEqual([1])
    // 3 + 3 students all fit into the single remaining group (maxSize 12)
    expect(regular[0]!.students.length).toBe(6)
    expect(shrunk[0]!.students.length).toBe(0)
  })

  it('balances removed students across remaining groups instead of filling the first', () => {
    const fourGroups = [
      { id: UNASSIGNED_GROUP_ID, students: [] as S[] },
      { id: 1, students: mk(6) },
      { id: 2, students: mk(6) },
      { id: 3, students: mk(6) },
      { id: 4, students: mk(6) },
    ]
    const shrunk = adjustGroupCount(fourGroups, 3, 12)
    const sizes = shrunk
      .filter(g => g.id !== UNASSIGNED_GROUP_ID)
      .map(g => g.students.length)
      .sort((a, b) => a - b)
    // Balanced [8,8,8], not the old lopsided [6,6,12] (finding 23).
    expect(sizes).toEqual([8, 8, 8])
  })

  it('overflows to the unassigned group when remaining groups are full', () => {
    const full = [
      { id: UNASSIGNED_GROUP_ID, students: [] as S[] },
      { id: 1, students: mk(2) },
      { id: 2, students: mk(2) },
    ]
    const shrunk = adjustGroupCount(full, 1, 2)
    // group 1 already has 2 (maxSize 2) → the 2 from removed group 2 overflow
    expect(shrunk.find(g => g.id === 1)!.students.length).toBe(2)
    expect(shrunk[0]!.students.length).toBe(2)
  })

  it('does not mutate the input groups', () => {
    const snapshot = JSON.stringify(base)
    adjustGroupCount(base, 1, 12)
    expect(JSON.stringify(base)).toBe(snapshot)
  })

  it('returns the same reference when the count is unchanged', () => {
    expect(adjustGroupCount(base, 2, 12)).toBe(base)
  })

  it('keeps classes pure when shrinking with a classKey', () => {
    type CS = { id: number; lastName: string; cls: string }
    const g = (id: number, cls: string, ids: number[]): { id: number; students: CS[] } => ({
      id,
      students: ids.map(n => ({ id: n, lastName: `${cls}${n}`, cls })),
    })
    const groups = [
      { id: UNASSIGNED_GROUP_ID, students: [] as CS[] },
      g(1, 'A', [1, 2, 3]),
      g(2, 'A', [4, 5, 6]),
      g(3, 'B', [7, 8, 9]),
    ]
    // Drop group 3 (class B); its students must not land in the class-A groups.
    const shrunk = adjustGroupCount(groups, 2, 12, s => s.cls)
    const regular = shrunk.filter(gr => gr.id !== UNASSIGNED_GROUP_ID)
    for (const gr of regular) {
      expect(new Set(gr.students.map(s => s.cls)).size).toBeLessThanOrEqual(1)
    }
    // The B students had no pure home with room → unassigned, not mixed in.
    expect(shrunk[0]!.students.map(s => s.cls)).toEqual(['B', 'B', 'B'])
  })
})

describe('renumberGroups', () => {
  it('renumbers regular groups to 1..n when out of sequence', () => {
    const groups = [
      { id: UNASSIGNED_GROUP_ID, students: [] as S[] },
      { id: 2, students: [] as S[] },
      { id: 5, students: [] as S[] },
    ]
    const result = renumberGroups(groups, 2)
    expect(result.filter(g => g.id !== UNASSIGNED_GROUP_ID).map(g => g.id)).toEqual([1, 2])
  })

  it('is a no-op (same reference) when already sequential and correct count', () => {
    const groups = [
      { id: UNASSIGNED_GROUP_ID, students: [] as S[] },
      { id: 1, students: [] as S[] },
      { id: 2, students: [] as S[] },
    ]
    expect(renumberGroups(groups, 2)).toBe(groups)
  })
})
