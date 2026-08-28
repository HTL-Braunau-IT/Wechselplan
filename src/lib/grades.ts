/**
 * Grading rules shared by the Notensammler and Noten pages.
 *
 * These were defined twice, once per page, and were the only place the
 * Austrian marking rules lived — in particular that 6 ("nicht beurteilt") and
 * 7 ("gestunden") are sentinels rather than marks and must never be averaged.
 */

export type Semester = 'first' | 'second'

/** Sentinel grades: not marks, excluded from every average. */
export const NICHT_BEURTEILT = 6
export const GESTUNDEN = 7

/** Teilnote: half steps allowed, plus the two sentinels. */
export const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]

/** Endnote: whole numbers only, plus the two sentinels. */
export const ALLOWED_FINAL_GRADES = [1, 2, 3, 4, 5, 6, 7]

/** Betragensnote (Wunsch) options; the first is the default when nothing is stored. */
export const CONDUCT_NOTE_WISH_OPTIONS = [
  'Sehr zufriedenstellend',
  'Zufriedenstellend',
  'Wenig Zufriedenstellend',
  'Nicht zufriedenstellend',
] as const

export const CONDUCT_NOTE_WISH_DEFAULT = CONDUCT_NOTE_WISH_OPTIONS[0]

/** Sentinel for the "clear" option — Radix Select rejects value="". */
export const CONDUCT_NOTE_WISH_NONE = '__none__'

export const ATTENDANCE_OPTIONS = ['Anwesend', 'Krank', 'Entschuldigt', 'Unentschuldigt'] as const

/** Grade dropdown options in the Noten grid (no sentinels — those are set via Endnote). */
export const GRADE_OPTIONS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

export const GRADE_CLEAR_VALUE = '__clear__'

export function getGradeDisplayText(grade: number | null): string {
  if (grade === null) return ''
  if (grade === NICHT_BEURTEILT) return 'nicht beurteilt'
  if (grade === GESTUNDEN) return 'gestunden'
  return grade.toString()
}

/** Parse a Teilnote from free text. Accepts "nb"/"gs" shorthands. Returns null when invalid. */
export function parseGradeInput(value: string): number | null {
  if (value === '' || value === null || value === undefined) return null

  const lowerValue = value.toLowerCase().trim()
  if (lowerValue === 'nicht beurteilt' || lowerValue === 'nb') return NICHT_BEURTEILT
  if (lowerValue === 'gestunden' || lowerValue === 'gs') return GESTUNDEN

  const gradeNum = parseFloat(value)
  if (!isNaN(gradeNum) && ALLOWED_GRADES.includes(gradeNum)) {
    return gradeNum
  }

  return null
}

/** Parse an Endnote from free text. Same shorthands, but half steps are rejected. */
export function parseFinalGradeInput(value: string): number | null {
  if (value === '' || value === null || value === undefined) return null

  const lowerValue = value.toLowerCase().trim()
  if (lowerValue === 'nicht beurteilt' || lowerValue === 'nb') return NICHT_BEURTEILT
  if (lowerValue === 'gestunden' || lowerValue === 'gs') return GESTUNDEN

  // parseInt() alone truncated "2.5" to 2, silently recording a better Endnote
  // than the teacher typed. Parse as a float and reject anything non-integer.
  const gradeNum = parseFloat(value)
  if (!isNaN(gradeNum) && Number.isInteger(gradeNum) && ALLOWED_FINAL_GRADES.includes(gradeNum)) {
    return gradeNum
  }

  return null
}

/** Only real marks (1-5, including half steps) count toward an average. */
export function isGradeIncludedInAverage(grade: number | null): boolean {
  if (grade === null) return false
  if (grade === NICHT_BEURTEILT || grade === GESTUNDEN) return false
  return grade >= 1 && grade <= 5
}

export type GradeCell = { first: number | null; second: number | null }
export type GradesByTeacher = Record<number, GradeCell>
export type GradesData = Record<number, GradesByTeacher>

/**
 * Average of a student's marks for one semester.
 *
 * A single sentinel anywhere in scope wins outright: if any teacher recorded
 * "nicht beurteilt" or "gestunden", that is the result rather than a number.
 * Pass `teacherIds` to restrict the calculation to one period (AM/PM).
 */
export function computeAverage(
  studentGrades: GradesByTeacher | undefined,
  semester: Semester,
  teacherIds?: ReadonlySet<number> | null,
): number | 'nicht beurteilt' | 'gestunden' | null {
  if (!studentGrades) return null

  const considerTeacher = (teacherId: number): boolean =>
    teacherIds == null || teacherIds.has(teacherId)

  // Scan all considered teachers before deciding, so the documented priority
  // (nicht beurteilt wins over gestunden) holds regardless of teacher-id
  // iteration order. Returning on the first sentinel seen made the result depend
  // on which teacher id happened to come first (finding 17).
  let hasNichtBeurteilt = false
  let hasGestunden = false
  for (const teacherKey in studentGrades) {
    const teacherId = parseInt(teacherKey)
    if (!considerTeacher(teacherId)) continue
    const grade = studentGrades[teacherId]?.[semester]
    if (grade === NICHT_BEURTEILT) hasNichtBeurteilt = true
    else if (grade === GESTUNDEN) hasGestunden = true
  }
  if (hasNichtBeurteilt) return 'nicht beurteilt'
  if (hasGestunden) return 'gestunden'

  const gradeValues: number[] = []
  for (const teacherKey in studentGrades) {
    const teacherId = parseInt(teacherKey)
    if (!considerTeacher(teacherId)) continue
    const grade = studentGrades[teacherId]?.[semester]
    if (grade !== null && grade !== undefined && isGradeIncludedInAverage(grade)) {
      gradeValues.push(grade)
    }
  }

  if (gradeValues.length === 0) return null
  const sum = gradeValues.reduce((acc, val) => acc + val, 0)
  return Math.round((sum / gradeValues.length) * 10) / 10
}

/** Normalize grades to numeric keys — the API returns string keys via JSON. */
export function normalizeGradesKeys(data: Record<string, unknown> | GradesData): GradesData {
  const result: GradesData = {}
  for (const studentKey of Object.keys(data)) {
    const studentId = Number(studentKey)
    if (Number.isNaN(studentId)) continue
    const byStudent = data[studentKey as keyof typeof data]
    if (byStudent == null || typeof byStudent !== 'object') continue
    const teacherMap = byStudent as Record<string, unknown>
    result[studentId] = {}
    for (const teacherKey of Object.keys(teacherMap)) {
      const teacherId = Number(teacherKey)
      if (Number.isNaN(teacherId)) continue
      const cell = teacherMap[teacherKey] as GradeCell | undefined
      if (cell == null || typeof cell !== 'object') continue
      result[studentId]![teacherId] = {
        first: cell.first ?? null,
        second: cell.second ?? null,
      }
    }
  }
  return result
}

/** Stable key for one attendance/grade cell in the Noten grid. */
export function entryKey(studentId: number, date: string, period: string): string {
  return `${studentId}-${date}-${period}`
}

/**
 * dateStr and semesterChangeDate are YYYY-MM-DD (or ISO with time).
 * A date on or after the change date belongs to the second semester.
 */
export function isSemester2(dateStr: string, semesterChangeDate: string | undefined): boolean {
  if (!semesterChangeDate) return false
  const change = semesterChangeDate.slice(0, 10)
  return dateStr >= change
}

const GRADE_BOX_CLASSES: Record<number, string> = {
  1: 'bg-green-100 dark:bg-green-900/40 border-green-200/70 dark:border-green-800/50',
  1.5: 'bg-emerald-100 dark:bg-emerald-900/35 border-emerald-200/70 dark:border-emerald-800/50',
  2: 'bg-lime-100 dark:bg-lime-900/35 border-lime-200/70 dark:border-lime-800/50',
  2.5: 'bg-yellow-100 dark:bg-yellow-900/35 border-yellow-200/70 dark:border-yellow-800/50',
  3: 'bg-yellow-100 dark:bg-yellow-900/35 border-yellow-300/70 dark:border-yellow-700/50',
  3.5: 'bg-amber-100 dark:bg-amber-900/35 border-amber-200/70 dark:border-amber-800/50',
  4: 'bg-orange-100 dark:bg-orange-900/35 border-orange-200/70 dark:border-orange-800/50',
  4.5: 'bg-orange-200 dark:bg-orange-800/40 border-orange-300/70 dark:border-orange-700/50',
  5: 'bg-red-100 dark:bg-red-900/35 border-red-200/70 dark:border-red-800/50',
}

export function getGradeBoxClass(grade: number | null): string {
  if (grade == null) return ''
  return GRADE_BOX_CLASSES[grade] ?? ''
}
