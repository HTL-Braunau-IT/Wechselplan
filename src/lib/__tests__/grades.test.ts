import { describe, it, expect } from 'vitest'
import {
  GESTUNDEN,
  NICHT_BEURTEILT,
  computeAverage,
  entryKey,
  getGradeBoxClass,
  getGradeDisplayText,
  isGradeIncludedInAverage,
  isSemester2,
  normalizeGradesKeys,
  parseFinalGradeInput,
  parseGradeInput,
} from '../grades'

describe('parseGradeInput', () => {
  it('parses whole and half marks', () => {
    expect(parseGradeInput('1')).toBe(1)
    expect(parseGradeInput('2.5')).toBe(2.5)
    expect(parseGradeInput('5')).toBe(5)
  })

  it('parses the sentinel words and their shorthands', () => {
    expect(parseGradeInput('nicht beurteilt')).toBe(NICHT_BEURTEILT)
    expect(parseGradeInput('NB')).toBe(NICHT_BEURTEILT)
    expect(parseGradeInput('  nb  ')).toBe(NICHT_BEURTEILT)
    expect(parseGradeInput('gestunden')).toBe(GESTUNDEN)
    expect(parseGradeInput('GS')).toBe(GESTUNDEN)
  })

  it('accepts the sentinels entered numerically', () => {
    expect(parseGradeInput('6')).toBe(NICHT_BEURTEILT)
    expect(parseGradeInput('7')).toBe(GESTUNDEN)
  })

  it('rejects marks outside the Austrian scale', () => {
    expect(parseGradeInput('0')).toBeNull()
    expect(parseGradeInput('8')).toBeNull()
    expect(parseGradeInput('5.5')).toBeNull()
    expect(parseGradeInput('-1')).toBeNull()
  })

  it('rejects empty and non-numeric input', () => {
    expect(parseGradeInput('')).toBeNull()
    expect(parseGradeInput('abc')).toBeNull()
  })
})

describe('parseFinalGradeInput', () => {
  it('parses whole marks and sentinels', () => {
    expect(parseFinalGradeInput('3')).toBe(3)
    expect(parseFinalGradeInput('nb')).toBe(NICHT_BEURTEILT)
    expect(parseFinalGradeInput('gs')).toBe(GESTUNDEN)
  })

  it('rejects half marks rather than truncating them', () => {
    // parseInt() used to turn "2.5" into 2 — a better Endnote than typed.
    expect(parseFinalGradeInput('2.5')).toBeNull()
    expect(parseFinalGradeInput('4.5')).toBeNull()
  })

  it('rejects out-of-range marks', () => {
    expect(parseFinalGradeInput('0')).toBeNull()
    expect(parseFinalGradeInput('8')).toBeNull()
  })
})

describe('isGradeIncludedInAverage', () => {
  it('includes real marks', () => {
    expect(isGradeIncludedInAverage(1)).toBe(true)
    expect(isGradeIncludedInAverage(3.5)).toBe(true)
    expect(isGradeIncludedInAverage(5)).toBe(true)
  })

  it('excludes the sentinels and null', () => {
    expect(isGradeIncludedInAverage(NICHT_BEURTEILT)).toBe(false)
    expect(isGradeIncludedInAverage(GESTUNDEN)).toBe(false)
    expect(isGradeIncludedInAverage(null)).toBe(false)
  })
})

describe('computeAverage', () => {
  it('returns null when the student has no grades', () => {
    expect(computeAverage(undefined, 'first')).toBeNull()
    expect(computeAverage({}, 'first')).toBeNull()
  })

  it('averages the marks of a semester and rounds to one decimal', () => {
    const grades = {
      1: { first: 1, second: null },
      2: { first: 2, second: null },
      3: { first: 2, second: null },
    }
    // (1 + 2 + 2) / 3 = 1.666… -> 1.7
    expect(computeAverage(grades, 'first')).toBe(1.7)
  })

  it('ignores the other semester', () => {
    const grades = {
      1: { first: 1, second: 5 },
      2: { first: 1, second: 5 },
    }
    expect(computeAverage(grades, 'first')).toBe(1)
    expect(computeAverage(grades, 'second')).toBe(5)
  })

  it('lets a single "nicht beurteilt" override the whole average', () => {
    const grades = {
      1: { first: 1, second: null },
      2: { first: NICHT_BEURTEILT, second: null },
    }
    expect(computeAverage(grades, 'first')).toBe('nicht beurteilt')
  })

  it('lets a single "gestunden" override the whole average', () => {
    const grades = {
      1: { first: 2, second: null },
      2: { first: GESTUNDEN, second: null },
    }
    expect(computeAverage(grades, 'first')).toBe('gestunden')
  })

  it('reports "nicht beurteilt" ahead of "gestunden" when both are present', () => {
    const grades = {
      1: { first: NICHT_BEURTEILT, second: null },
      2: { first: GESTUNDEN, second: null },
    }
    expect(computeAverage(grades, 'first')).toBe('nicht beurteilt')
  })

  it('reports "nicht beurteilt" ahead of "gestunden" regardless of teacher-id order', () => {
    // The GESTUNDEN teacher has the LOWER id here: priority must not depend on
    // iteration order (finding 17).
    const grades = {
      2: { first: GESTUNDEN, second: null },
      5: { first: NICHT_BEURTEILT, second: null },
    }
    expect(computeAverage(grades, 'first')).toBe('nicht beurteilt')
  })

  it('skips missing marks rather than counting them as zero', () => {
    const grades = {
      1: { first: 2, second: null },
      2: { first: null, second: null },
    }
    expect(computeAverage(grades, 'first')).toBe(2)
  })

  it('restricts the calculation to the given teachers', () => {
    const grades = {
      1: { first: 1, second: null },
      2: { first: 5, second: null },
    }
    expect(computeAverage(grades, 'first', new Set([1]))).toBe(1)
    expect(computeAverage(grades, 'first', new Set([2]))).toBe(5)
    expect(computeAverage(grades, 'first', new Set([1, 2]))).toBe(3)
  })

  it('ignores a sentinel recorded by a teacher outside the period', () => {
    const grades = {
      1: { first: 2, second: null },
      2: { first: NICHT_BEURTEILT, second: null },
    }
    expect(computeAverage(grades, 'first', new Set([1]))).toBe(2)
  })

  it('returns null when the period filter matches no grades', () => {
    const grades = { 1: { first: 2, second: null } }
    expect(computeAverage(grades, 'first', new Set([99]))).toBeNull()
  })
})

describe('getGradeDisplayText', () => {
  it('renders marks, sentinels and null', () => {
    expect(getGradeDisplayText(2.5)).toBe('2.5')
    expect(getGradeDisplayText(NICHT_BEURTEILT)).toBe('nicht beurteilt')
    expect(getGradeDisplayText(GESTUNDEN)).toBe('gestunden')
    expect(getGradeDisplayText(null)).toBe('')
  })

  it('round-trips through parseGradeInput', () => {
    for (const grade of [1, 1.5, 3, 4.5, 5, NICHT_BEURTEILT, GESTUNDEN]) {
      expect(parseGradeInput(getGradeDisplayText(grade))).toBe(grade)
    }
  })
})

describe('normalizeGradesKeys', () => {
  it('converts string keys from JSON into numbers', () => {
    const result = normalizeGradesKeys({ '10': { '20': { first: 1, second: 2 } } })
    expect(result[10]?.[20]).toEqual({ first: 1, second: 2 })
  })

  it('defaults missing semester values to null', () => {
    const result = normalizeGradesKeys({ '10': { '20': { first: 1 } } })
    expect(result[10]?.[20]).toEqual({ first: 1, second: null })
  })

  it('drops non-numeric and malformed entries', () => {
    const result = normalizeGradesKeys({
      abc: { '20': { first: 1, second: null } },
      '10': { xyz: { first: 1, second: null }, '20': null as never },
    })
    // The non-numeric student key is skipped entirely...
    expect(Object.keys(result)).toEqual(['10'])
    // ...as are a non-numeric teacher key and a null cell.
    expect(result[10]).toEqual({})
  })
})

describe('isSemester2', () => {
  it('treats the change date itself as the second semester', () => {
    expect(isSemester2('2026-02-06', '2026-02-06')).toBe(true)
  })

  it('classifies dates either side of the change', () => {
    expect(isSemester2('2026-02-05', '2026-02-06')).toBe(false)
    expect(isSemester2('2026-02-07', '2026-02-06')).toBe(true)
  })

  it('tolerates an ISO timestamp as the change date', () => {
    expect(isSemester2('2026-02-07', '2026-02-06T00:00:00.000Z')).toBe(true)
  })

  it('falls back to the first semester when no change date is known', () => {
    expect(isSemester2('2026-02-07', undefined)).toBe(false)
  })
})

describe('entryKey', () => {
  it('is stable and distinguishes each dimension', () => {
    expect(entryKey(1, '2026-02-06', 'AM')).toBe('1-2026-02-06-AM')
    expect(entryKey(1, '2026-02-06', 'AM')).not.toBe(entryKey(1, '2026-02-06', 'PM'))
    expect(entryKey(1, '2026-02-06', 'AM')).not.toBe(entryKey(2, '2026-02-06', 'AM'))
  })
})

describe('getGradeBoxClass', () => {
  it('returns a colour for every mark on the scale', () => {
    for (const grade of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
      expect(getGradeBoxClass(grade)).not.toBe('')
    }
  })

  it('returns nothing for null and the sentinels', () => {
    expect(getGradeBoxClass(null)).toBe('')
    expect(getGradeBoxClass(NICHT_BEURTEILT)).toBe('')
    expect(getGradeBoxClass(GESTUNDEN)).toBe('')
  })
})
