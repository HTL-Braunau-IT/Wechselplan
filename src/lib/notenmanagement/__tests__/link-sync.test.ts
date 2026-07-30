import { describe, expect, it } from 'vitest'
import { computePlan, type StudentForLink } from '@/lib/notenmanagement/link-sync'
import type { NmStudent } from '@/lib/notenmanagement/server-client'

function student(over: Partial<StudentForLink> & { id: number }): StudentForLink {
  return {
    firstName: 'First',
    lastName: 'Last',
    sokratesId: null,
    matrikelnummer: null,
    nmKlasse: null,
    ...over,
  }
}

function nm(over: Partial<NmStudent> & { Matrikelnummer: number }): NmStudent {
  return { Student_ID: undefined, Nachname: 'Last', Vorname: 'First', Klasse: '3BHME', ...over }
}

describe('computePlan (deterministic Sokrates-id matching)', () => {
  it('links a student whose sokratesId matches an NM Student_ID', () => {
    const { summary, updates } = computePlan(
      [student({ id: 1, sokratesId: '404-A' })],
      [nm({ Matrikelnummer: 1011, Student_ID: '404-A', Klasse: '3BHMEA' })],
    )
    expect(summary.linked).toBe(1)
    expect(summary.withSokratesId).toBe(1)
    expect(updates).toEqual([{ id: 1, matrikelnummer: '1011', nmKlasse: '3BHMEA' }])
  })

  it('counts a student without a sokratesId as unlinkable', () => {
    const { summary, updates } = computePlan(
      [student({ id: 1, sokratesId: null, lastName: 'Nobody' })],
      [nm({ Matrikelnummer: 1011, Student_ID: '404-A' })],
    )
    expect(summary.missingSokratesId).toBe(1)
    expect(summary.missingSokratesIdSamples).toContain('Nobody First')
    expect(updates).toHaveLength(0)
  })

  it('counts a student with sokratesId but no NM row as no-match', () => {
    const { summary } = computePlan(
      [student({ id: 1, sokratesId: 'ZZZ', lastName: 'Ghost' })],
      [nm({ Matrikelnummer: 1011, Student_ID: '404-A' })],
    )
    expect(summary.noNmMatch).toBe(1)
    expect(summary.noNmMatchSamples).toContain('Ghost First')
    expect(summary.nmOnly).toBe(1)
  })

  it('reports updated vs unchanged correctly', () => {
    const nmStudents = [
      nm({ Matrikelnummer: 2000, Student_ID: 'A', Klasse: '3BHME' }),
      nm({ Matrikelnummer: 3000, Student_ID: 'B', Klasse: '3BHME' }),
    ]
    const { summary, updates } = computePlan(
      [
        student({ id: 1, sokratesId: 'A', matrikelnummer: '2000', nmKlasse: '3BHME' }), // unchanged
        student({ id: 2, sokratesId: 'B', matrikelnummer: '9999', nmKlasse: '3BHME' }), // changed matrikel
      ],
      nmStudents,
    )
    expect(summary.unchanged).toBe(1)
    expect(summary.updated).toBe(1)
    // Both are still written (nmLinkedAt refresh), but the unchanged one keeps its value.
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 1, matrikelnummer: '2000', nmKlasse: '3BHME' },
        { id: 2, matrikelnummer: '3000', nmKlasse: '3BHME' },
      ]),
    )
  })

  it('ignores NM rows with a blank Student_ID', () => {
    const { summary } = computePlan(
      [student({ id: 1, sokratesId: '' })],
      [nm({ Matrikelnummer: 1, Student_ID: '' })],
    )
    expect(summary.linked).toBe(0)
    expect(summary.missingSokratesId).toBe(1)
    expect(summary.nmOnly).toBe(0)
  })
})
