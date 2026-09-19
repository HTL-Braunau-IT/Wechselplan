import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEIGHTS,
  inheritedWeights,
  isWeightConfigValid,
  resolveWeights,
  weightSum,
  type WeightConfig,
} from '../noten-weights'

const g: WeightConfig = { weightWiederholung: 40, weightBericht: 30, weightMitarbeit: 20, weightPraktischeArbeit: 10 }
const c: WeightConfig = { weightWiederholung: 30, weightBericht: 30, weightMitarbeit: 30, weightPraktischeArbeit: 10 }
const glob: WeightConfig = { weightWiederholung: 10, weightBericht: 20, weightMitarbeit: 30, weightPraktischeArbeit: 40 }

describe('resolveWeights', () => {
  it('prefers the group override over class and global', () => {
    expect(resolveWeights({ group: g, class: c, global: glob })).toBe(g)
  })

  it('falls back to the class default when the group is unset', () => {
    expect(resolveWeights({ group: null, class: c, global: glob })).toBe(c)
  })

  it('falls back to the global default when group and class are unset', () => {
    expect(resolveWeights({ group: null, class: null, global: glob })).toBe(glob)
  })

  it('falls back to 25/25/25/25 when nothing is set at any level', () => {
    expect(resolveWeights({})).toEqual(DEFAULT_WEIGHTS)
    expect(resolveWeights({ group: null, class: null, global: null })).toEqual(DEFAULT_WEIGHTS)
  })
})

describe('inheritedWeights', () => {
  it('group inherits from class, then global, then default', () => {
    expect(inheritedWeights('group', { class: c, global: glob })).toBe(c)
    expect(inheritedWeights('group', { class: null, global: glob })).toBe(glob)
    expect(inheritedWeights('group', {})).toEqual(DEFAULT_WEIGHTS)
  })

  it('class inherits from global, then default', () => {
    expect(inheritedWeights('class', { global: glob })).toBe(glob)
    expect(inheritedWeights('class', {})).toEqual(DEFAULT_WEIGHTS)
  })

  it('global has nothing above it, so it inherits the default', () => {
    expect(inheritedWeights('global', { global: glob })).toEqual(DEFAULT_WEIGHTS)
  })
})

describe('isWeightConfigValid', () => {
  it('accepts a split that sums to 100 with each field in range', () => {
    expect(isWeightConfigValid(g)).toBe(true)
    expect(isWeightConfigValid(DEFAULT_WEIGHTS)).toBe(true)
  })

  it('rejects a split that does not sum to 100', () => {
    expect(
      isWeightConfigValid({ weightWiederholung: 25, weightBericht: 25, weightMitarbeit: 25, weightPraktischeArbeit: 24 }),
    ).toBe(false)
  })

  it('rejects an out-of-range field even when the sum is 100', () => {
    expect(
      isWeightConfigValid({ weightWiederholung: 200, weightBericht: -100, weightMitarbeit: 0, weightPraktischeArbeit: 0 }),
    ).toBe(false)
  })
})

describe('weightSum', () => {
  it('adds the four fields', () => {
    expect(weightSum(g)).toBe(100)
  })
})
