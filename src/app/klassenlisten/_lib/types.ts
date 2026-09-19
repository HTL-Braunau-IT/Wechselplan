/**
 * Client-side types for the Klassenliste feature.
 *
 * Kept separate from `@/lib/klassenliste` so the browser bundle never pulls in
 * Prisma. The group palette used by the preview comes from `@/lib/pdf/palette`,
 * which is renderer-free and safe to import here.
 */

export type WritingSpace = 'columns' | 'split' | 'notes' | 'blank'

/** Synthetic section id for students with no rotation group. Mirrors the server. */
export const UNGROUPED_SECTION_ID = 0

export interface WritingSpaceOption {
  key: WritingSpace
  label: string
}

export interface KlassenlistePerson {
  firstName: string
  lastName: string
}

export interface KlassenlisteSection {
  id: number
  students: KlassenlistePerson[]
}

/** Response of `GET /api/klassenliste/data`. */
export interface KlassenlisteData {
  className: string
  schoolYearLabel: string
  classHead: string | null
  classLead: string | null
  hasPlan: boolean
  /** Group sections (plus a trailing ungrouped one) when the class has a plan. */
  sections: KlassenlisteSection[]
  /** All students as one flat list when the class has no plan. */
  plain: KlassenlistePerson[]
  total: number
}

export interface ClassOption {
  id: number
  name: string
}
