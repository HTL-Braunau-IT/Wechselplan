'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import type { Semester } from '@/lib/grades'
import { CONDUCT_NOTE_WISH_DEFAULT } from '@/lib/grades'
import type { NotenlisteSuggestions } from '../_hooks/use-notenliste-suggestions'
import type { ClassData, FinalGradesData, Period, SemesterView, Student, Teacher } from '../_lib/types'
import { EntryRow } from './entry-row'

export type EntryRosterProps = {
  classData: ClassData
  /** Already sorted and filtered to grouped students by the page. */
  students: Student[]
  finalGrades: FinalGradesData
  suggestions: NotenlisteSuggestions
  myTeacherId: number | null
  currentTeacherTeachesClass: boolean
  currentSemester: Semester | null
  semesterView: SemesterView
  tablePeriod: Period | undefined
  getGrade: (studentId: number, teacherId: number, semester: Semester) => number | null
  getFinalGradeDisplay: (studentId: number, semester: Semester) => number | null
  calculateAverage: (
    studentId: number,
    semester: Semester,
    period?: Period,
  ) => number | string | null
  onGradeChange: (studentId: number, teacherId: number, semester: Semester, value: string) => void
  onFinalGradeChange: (studentId: number, semester: Semester, value: string) => void
  onConductWishChange: (studentId: number, semester: Semester, value: string) => void
  canManageSokrates?: boolean
  isSemesterLocked?: (semester: Semester) => boolean
  isCellLocked?: (teacherId: number, semester: Semester) => boolean
}

/**
 * The Notensammler entry view: the signed-in teacher's roster for one subject
 * and semester, split into the students who still owe a mark ("Offen") and the
 * ones already graded ("Erledigt"). Replaces the all-teachers spreadsheet grid.
 *
 * Entry is keyboard-first: the focused open row takes a `1`–`5` keystroke as its
 * mark, `Tab` accepts the Notenliste suggestion, and `Enter` jumps to the next
 * open student. Focus only follows the keyboard once the teacher has started —
 * the list never steals focus on load.
 */
export function EntryRoster({
  classData,
  students,
  finalGrades,
  suggestions,
  myTeacherId,
  currentTeacherTeachesClass,
  currentSemester,
  semesterView,
  tablePeriod,
  getGrade,
  getFinalGradeDisplay,
  calculateAverage,
  onGradeChange,
  onFinalGradeChange,
  onConductWishChange,
  canManageSokrates = false,
  isSemesterLocked,
  isCellLocked,
}: EntryRosterProps) {
  const { t } = useTranslation()

  // Entry always targets one semester; "Beide" falls back to the live one.
  const entrySemester: Semester =
    semesterView === 'both' ? (currentSemester ?? 'first') : semesterView

  const canEnter = currentTeacherTeachesClass && myTeacherId != null

  /** The teachers whose marks show as "Kollegen" — the visible period, minus me. */
  const inPeriod: Teacher[] =
    tablePeriod === 'AM'
      ? classData.amTeachers
      : tablePeriod === 'PM'
        ? classData.pmTeachers
        : [...classData.amTeachers, ...classData.pmTeachers]
  const colleagueTeachers = inPeriod.filter(teacher => teacher.id !== myTeacherId)

  // Each student's index is its position in the full roster, kept stable across
  // the open/done split so the numbers read like a class register.
  const rows = students.map((student, i) => {
    const mark = canEnter && myTeacherId != null ? getGrade(student.id, myTeacherId, entrySemester) : null
    const colleagues = colleagueTeachers
      .map(teacher => getGrade(student.id, teacher.id, entrySemester))
      .filter((value): value is number => value != null)
    const suggestionCell = suggestions[student.id]
    const suggestion =
      (entrySemester === 'first' ? suggestionCell?.first : suggestionCell?.second) ?? null
    const conductWish =
      (entrySemester === 'first'
        ? finalGrades[student.id]?.conductWishFirst
        : finalGrades[student.id]?.conductWishSecond) ?? CONDUCT_NOTE_WISH_DEFAULT
    return {
      index: i + 1,
      student,
      mark,
      colleagues,
      suggestion,
      conductWish,
      average: calculateAverage(student.id, entrySemester, tablePeriod),
      endnote: getFinalGradeDisplay(student.id, entrySemester),
      open: canEnter && mark == null,
    }
  })

  const openRows = rows.filter(row => row.open)
  const doneRows = rows.filter(row => !row.open)
  const openIds = openRows.map(row => row.student.id)

  const [focusedId, setFocusedId] = useState<number | null>(null)
  const [doneCollapsed, setDoneCollapsed] = useState(false)
  const rowRefs = useRef(new Map<number, HTMLDivElement | null>())
  // Focus only follows state once the teacher is actually driving the list.
  const interacted = useRef(false)

  // Keep the focus target valid: default to the first open row, and when the
  // focused student is graded (leaves the open list) fall back to the new first.
  useEffect(() => {
    if (openIds.length === 0) {
      setFocusedId(null)
      return
    }
    setFocusedId(prev => (prev != null && openIds.includes(prev) ? prev : (openIds[0] ?? null)))
  }, [openIds])

  useEffect(() => {
    if (!interacted.current || focusedId == null) return
    rowRefs.current.get(focusedId)?.focus()
  }, [focusedId])

  const focusNextOpen = (fromId: number) => {
    const idx = openIds.indexOf(fromId)
    const next = idx >= 0 ? openIds[idx + 1] : undefined
    if (next != null) setFocusedId(next)
  }

  const markLocked =
    (myTeacherId != null && (isCellLocked?.(myTeacherId, entrySemester) ?? false)) &&
    !canManageSokrates
  const summaryLocked = (isSemesterLocked?.(entrySemester) ?? false) && !canManageSokrates

  const handleRowKeyDown =
    (studentId: number, suggestion: number | null) =>
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!canEnter || myTeacherId == null || markLocked) return
      // Ignore keys bubbling up from the Endnote/Betragen controls inside the row.
      if (event.target !== event.currentTarget) return
      interacted.current = true

      if (event.key >= '1' && event.key <= '5') {
        event.preventDefault()
        onGradeChange(studentId, myTeacherId, entrySemester, event.key)
        focusNextOpen(studentId)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        focusNextOpen(studentId)
        return
      }
      if (event.key === 'Tab' && !event.shiftKey && suggestion != null) {
        event.preventDefault()
        onGradeChange(studentId, myTeacherId, entrySemester, String(suggestion))
        focusNextOpen(studentId)
      }
    }

  const subjectLabel = classData.hasSeparateAmPmSubjects
    ? tablePeriod === 'PM'
      ? classData.subjectNamePm
      : classData.subjectNameAm
    : classData.subjectName

  const setRowRef = (studentId: number) => (el: HTMLDivElement | null) => {
    rowRefs.current.set(studentId, el)
  }

  const renderRow = (row: (typeof rows)[number], variant: 'open' | 'done') => (
    <EntryRow
      key={row.student.id}
      index={row.index}
      student={row.student}
      mark={row.mark}
      colleagues={row.colleagues}
      average={row.average}
      endnote={row.endnote}
      conductWish={row.conductWish}
      suggestion={row.suggestion}
      focused={variant === 'open' && focusedId === row.student.id}
      variant={variant}
      containerRef={variant === 'open' ? setRowRef(row.student.id) : undefined}
      onFocus={() => variant === 'open' && setFocusedId(row.student.id)}
      onKeyDown={variant === 'open' ? handleRowKeyDown(row.student.id, row.suggestion) : undefined}
      onGradeChange={value =>
        myTeacherId != null && onGradeChange(row.student.id, myTeacherId, entrySemester, value)
      }
      onFinalGradeChange={value => onFinalGradeChange(row.student.id, entrySemester, value)}
      onConductWishChange={value => onConductWishChange(row.student.id, entrySemester, value)}
      markLocked={markLocked}
      summaryLocked={summaryLocked}
    />
  )

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <div className="min-w-[1240px]">
          {canEnter && openRows.length > 0 && (
            <>
              <div className="bg-warning/[0.07] border-border flex items-center gap-2 border-b px-5 py-2.5">
                <span className="text-warning-foreground text-xs font-semibold tracking-wide uppercase">
                  {t('notensammler.openSection', 'Offen')} · {openRows.length}
                </span>
                {subjectLabel && (
                  <span className="text-muted-foreground text-xs">
                    {t('notensammler.openSectionHint', 'Diese warten auf deine Note in {{subject}}.', {
                      subject: subjectLabel,
                    })}
                  </span>
                )}
              </div>
              <div className="bg-card flex flex-col">{openRows.map(row => renderRow(row, 'open'))}</div>
            </>
          )}

          {doneRows.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setDoneCollapsed(prev => !prev)}
                className="bg-muted/[0.35] border-border flex w-full items-center gap-2 border-y px-5 py-2.5 text-left"
              >
                <CheckCircle2 className="text-success h-3.5 w-3.5" aria-hidden />
                <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  {t('notensammler.doneSection', 'Erledigt')} · {doneRows.length}
                </span>
                <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 text-xs">
                  {doneCollapsed
                    ? t('notensammler.expand', 'ausklappen')
                    : t('notensammler.collapse', 'einklappen')}
                  {doneCollapsed ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronUp className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
              {!doneCollapsed && (
                <div className="bg-card flex flex-col">
                  {doneRows.map(row => renderRow(row, 'done'))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
