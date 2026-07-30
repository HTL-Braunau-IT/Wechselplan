import { NICHT_BEURTEILT, GESTUNDEN } from '@/lib/grades'
import { truncateSubject } from '@/lib/subject-utils'

/**
 * Shared grade/subject mapping for the Notenmanagement transfer, used by both the
 * preview and the transfer routes so they can never disagree.
 */

export type NmNote = 1 | 2 | 3 | 4 | 5

export interface NmNoteResult {
  /** Integer 1–5, or null when the student is not graded numerically. */
  note: NmNote | null
  /** NM comment carrying the reason when `note` is null. */
  kommentar: string
  /** Human label for the null cases, for the UI. */
  nullNoteLabel: 'Nicht beurteilt' | 'Gestundet' | null
}

/**
 * Maps a reviewed Endnote (`FinalGrade.grade`, 1–7 or null) to the Notenmanagement
 * note/comment pair. The sentinels mirror `src/lib/grades.ts`: 6 = nicht
 * beurteilt, 7 = gestundet — both sent as `Note: null` with an explaining
 * comment. Half grades are rounded (NM only accepts whole 1–5).
 */
export function nmNoteFromEndnote(grade: number | null | undefined): NmNoteResult {
  if (grade == null) return { note: null, kommentar: '', nullNoteLabel: null }
  const g = Math.round(grade)
  if (g === NICHT_BEURTEILT) return { note: null, kommentar: 'Nicht beurteilt', nullNoteLabel: 'Nicht beurteilt' }
  if (g === GESTUNDEN) return { note: null, kommentar: 'Gestundet', nullNoteLabel: 'Gestundet' }
  if (g >= 1 && g <= 5) return { note: g as NmNote, kommentar: '', nullNoteLabel: null }
  return { note: null, kommentar: '', nullNoteLabel: null }
}

/** The most common subject across a class's teacher assignments (truncated for NM). */
export function deriveSubjectForClass(
  assignments: Array<{ subject: { name: string } | null }>,
): { subjectName: string; subjectTruncated: string } | null {
  const counts = new Map<string, number>()
  for (const a of assignments) {
    const name = a.subject?.name
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  let subjectName: string | undefined
  let max = 0
  for (const [name, count] of counts) {
    if (count > max) {
      max = count
      subjectName = name
    }
  }
  if (!subjectName) return null
  return { subjectName, subjectTruncated: truncateSubject(subjectName) }
}

/** NM `LF.Typ` for a transfer. Class = Semester-/Jahresnote; group = Notenstand. */
export function lfTypeFor(semester: 'first' | 'second', isGroup: boolean): string {
  if (isGroup) return 'Notenstand'
  return semester === 'first' ? 'Semesternote' : 'Jahresnote'
}

/** NM expects `YYYY-MM-DDT00:00:00`. */
export function toLfDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T00:00:00`
}
