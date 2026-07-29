import { describe, it, expect } from 'vitest'
import { rotatedGroupIndex, buildRotationForSave } from '@/lib/rotation'

describe('rotatedGroupIndex', () => {
  it('assigns teacher t to group (t + turn) mod groupCount', () => {
    // 3 groups: at turn 0 teachers map 1:1, at turn 1 everyone shifts by one
    expect(rotatedGroupIndex(0, 0, 3)).toBe(0)
    expect(rotatedGroupIndex(1, 0, 3)).toBe(1)
    expect(rotatedGroupIndex(2, 0, 3)).toBe(2)
    expect(rotatedGroupIndex(0, 1, 3)).toBe(1)
    expect(rotatedGroupIndex(2, 1, 3)).toBe(0)
    expect(rotatedGroupIndex(2, 2, 3)).toBe(1)
  })

  it('returns -1 when there are no groups', () => {
    expect(rotatedGroupIndex(0, 0, 0)).toBe(-1)
  })
})

describe('buildRotationForSave', () => {
  const groups = [{ id: 10 }, { id: 20 }, { id: 30 }]

  it('produces one entry per group with a teacher for every turn (equal counts)', () => {
    const payload = buildRotationForSave(groups, [100, 200, 300], 3)
    expect(payload.map(p => p.groupId)).toEqual([10, 20, 30])
    // turn 0: group 10←t100, group 20←t200, group 30←t300
    expect(payload.map(p => p.turns[0])).toEqual([100, 200, 300])
    // turn 1: everyone shifts — group (t+1): 10←t300, 20←t100, 30←t200
    expect(payload.map(p => p.turns[1])).toEqual([300, 100, 200])
  })

  it('is the exact inverse of the preview formula', () => {
    const teacherIds = [100, 200, 300]
    const turnCount = 4
    const payload = buildRotationForSave(groups, teacherIds, turnCount)
    // For every teacher/turn cell in the preview, the saved payload must record
    // that same teacher on the group the preview shows.
    for (let turn = 0; turn < turnCount; turn++) {
      for (let t = 0; t < teacherIds.length; t++) {
        const groupIdx = rotatedGroupIndex(t, turn, groups.length)
        expect(payload[groupIdx]!.turns[turn]).toBe(teacherIds[t])
      }
    }
  })

  it('leaves groups without a rotating teacher as null (fewer teachers than groups)', () => {
    const payload = buildRotationForSave(groups, [100], 1)
    // Only teacher 100 → group 0 at turn 0; the others get null.
    expect(payload.map(p => p.turns[0])).toEqual([100, null, null])
  })

  it('handles no groups without throwing', () => {
    expect(buildRotationForSave([], [100], 2)).toEqual([])
  })
})
