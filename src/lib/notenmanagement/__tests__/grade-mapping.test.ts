import { describe, expect, it } from 'vitest'
import {
  deriveSubjectForClass,
  lfTypeFor,
  nmNoteFromEndnote,
} from '@/lib/notenmanagement/grade-mapping'

describe('nmNoteFromEndnote', () => {
  it('maps numeric grades 1-5 directly', () => {
    for (const g of [1, 2, 3, 4, 5]) {
      expect(nmNoteFromEndnote(g)).toEqual({ note: g, kommentar: '', nullNoteLabel: null })
    }
  })

  it('rounds half grades to the nearest whole note', () => {
    expect(nmNoteFromEndnote(1.5).note).toBe(2)
    expect(nmNoteFromEndnote(2.4).note).toBe(2)
  })

  it('maps sentinel 6 to "Nicht beurteilt" with null note', () => {
    expect(nmNoteFromEndnote(6)).toEqual({
      note: null,
      kommentar: 'Nicht beurteilt',
      nullNoteLabel: 'Nicht beurteilt',
    })
  })

  it('maps sentinel 7 to "Gestundet" with null note', () => {
    expect(nmNoteFromEndnote(7)).toEqual({
      note: null,
      kommentar: 'Gestundet',
      nullNoteLabel: 'Gestundet',
    })
  })

  it('treats null/undefined as no note', () => {
    expect(nmNoteFromEndnote(null)).toEqual({ note: null, kommentar: '', nullNoteLabel: null })
    expect(nmNoteFromEndnote(undefined)).toEqual({ note: null, kommentar: '', nullNoteLabel: null })
  })
})

describe('deriveSubjectForClass', () => {
  it('picks the most common subject and truncates it', () => {
    const result = deriveSubjectForClass([
      { subject: { name: 'Angewandte Mathematik' } },
      { subject: { name: 'Angewandte Mathematik' } },
      { subject: { name: 'Deutsch' } },
    ])
    expect(result?.subjectName).toBe('Angewandte Mathematik')
    expect(result?.subjectTruncated).toBeTruthy()
  })

  it('returns null when no subject is present', () => {
    expect(deriveSubjectForClass([{ subject: null }])).toBeNull()
    expect(deriveSubjectForClass([])).toBeNull()
  })
})

describe('lfTypeFor', () => {
  it('uses Notenstand for group transfers', () => {
    expect(lfTypeFor('first', true)).toBe('Notenstand')
    expect(lfTypeFor('second', true)).toBe('Notenstand')
  })

  it('uses Semesternote / Jahresnote for class transfers', () => {
    expect(lfTypeFor('first', false)).toBe('Semesternote')
    expect(lfTypeFor('second', false)).toBe('Jahresnote')
  })
})
