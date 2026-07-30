/**
 * Shared Notenmanagement transfer types.
 *
 * These were duplicated between the notensammler and noten pages; keeping one
 * copy means a change to the transfer contract lands in a single place.
 */

export type Semester = 'first' | 'second'

/** A Notenmanagement mark. Whole marks only. */
export type NmNote = 1 | 2 | 3 | 4 | 5

/** When a mark is null, the reason carried alongside it. */
export type NullNoteLabel = 'Nicht beurteilt' | 'Gestundet'

/** Editable note in the preview: 1-5, or a label sent as Note: null with a reason. */
export type EditableNote = NmNote | NullNoteLabel

export type PreviewStudent = {
  studentId: number
  firstName: string
  lastName: string
  /** The reviewed FinalGrade (1-7), or null when none has been set. */
  endnote: number | null
  /** The Notenmanagement mark derived from the Endnote. */
  note: NmNote | null
  /** When note is null but the Endnote maps to a reason, that reason. */
  nullNoteLabel: NullNoteLabel | null
  hasEndnote: boolean
  /** Whether the student is pre-linked to Notenmanagement (has a Matrikelnummer). */
  linked: boolean
  matrikelnummer: string | null
  nmKlasse: string | null
}

export type PreviewCounts = {
  totalScoped: number
  linked: number
  unlinked: number
  withEndnote: number
  withoutEndnote: number
  readyToSend: number
}

export type TransferStatus = {
  first: { transferred: boolean; lfId: string | null }
  second: { transferred: boolean; lfId: string | null }
}

export type TransferPreviewResponse = {
  classId: number
  className: string
  subjectName: string | null
  subjectTruncated: string | null
  semester: Semester
  schoolYearId: number
  students: PreviewStudent[]
  counts: PreviewCounts
  /** Names of students without a Matrikelnummer, so they can be linked first. */
  unlinkedStudents: string[]
  /** Names of linked students still missing an Endnote. */
  withoutEndnoteStudents: string[]
  transferStatus: TransferStatus
}

/** One override the teacher explicitly changed from the previewed value. */
export type TransferNoteOverride = {
  studentId: number
  note: NmNote | null
  nullNoteReason?: NullNoteLabel
}

export type TransferResultResponse = {
  success: boolean
  transfers: Array<{ klasse: string; lfId: string; count: number }>
  lfId: string
  sentCount: number
  /** Names of students skipped because they are not linked. */
  unlinked: string[]
  /** Names of students skipped because they have no Endnote. */
  noEndnote: string[]
  token?: string
  tokenExpiresIn?: number
}

export type LfViewNote = {
  Matrikelnummer: number
  Nachname: string
  Vorname: string
  Note: number
  Punkte: number
  Kommentar: string
}

export type LfViewResponse = {
  success?: boolean
  notes?: LfViewNote[]
}
