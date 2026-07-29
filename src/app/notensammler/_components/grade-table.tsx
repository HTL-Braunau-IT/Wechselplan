'use client'

import { Fragment, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GradeCombobox } from '@/components/ui/grade-combobox'
import { StudentPhoto } from '@/components/student-photo'
import { cn } from '@/lib/utils'
import {
  CONDUCT_NOTE_WISH_DEFAULT,
  CONDUCT_NOTE_WISH_NONE,
  CONDUCT_NOTE_WISH_OPTIONS,
  getGradeDisplayText,
  type Semester,
} from '@/lib/grades'
import type {
  ClassData,
  FinalGradesData,
  Period,
  SemesterView,
  Student,
  Teacher,
} from '../_lib/types'
import { TeacherColumnHeader } from './teacher-column-header'

/** A cell the signed-in teacher still owes a mark for. */
const MISSING_CELL_CLASS = 'bg-warning/10'

/**
 * Height of the first header row. The second row is pinned directly beneath it,
 * which needs the offset as a number — so the row's height is fixed rather than
 * left to its content.
 */
const GROUP_ROW_HEIGHT = 28

/** Sticky offsets for the three identity columns, in px. */
const STICKY_LEFT = { index: 0, group: 40, name: 80 }

export type GradeTableProps = {
  classData: ClassData
  students: Student[]
  finalGrades: FinalGradesData
  currentTeacherId: number | null
  currentTeacherTeachesClass: boolean
  currentSemester: Semester | null
  /** Which half of the year the grid shows. */
  semesterView: SemesterView
  /** Set when the class has separate AM/PM subjects: only that period is shown. */
  tablePeriod: Period | undefined
  getGrade: (studentId: number, teacherId: number, semester: Semester) => number | null
  getFinalGradeDisplay: (studentId: number, semester: Semester) => number | null
  calculateAverage: (
    studentId: number,
    semester: Semester,
    period?: Period,
  ) => number | string | null
  hasMissingInCurrentSemester: (studentId: number) => boolean
  onGradeChange: (studentId: number, teacherId: number, semester: Semester, value: string) => void
  onFinalGradeChange: (studentId: number, semester: Semester, value: string) => void
  onConductWishChange: (studentId: number, semester: Semester, value: string) => void
  onDeleteTeacher: (teacher: Teacher) => void
  /** Sokrates transfer lock: the class lead or an admin may still edit. */
  canManageSokrates?: boolean
  isSemesterMarked?: (semester: Semester) => boolean
  /** Blanket lock — freezes the class-wide Endnote and Betragensnote cells. */
  isSemesterLocked?: (semester: Semester) => boolean
  isCellLocked?: (teacherId: number, semester: Semester) => boolean
  isCellDrifted?: (studentId: number, teacherId: number, semester: Semester) => boolean
  onToggleColumnLock?: (teacherId: number, semester: Semester, locked: boolean) => void
}

/**
 * The grade grid: one column per teacher per semester, plus average, Endnote
 * and Betragensnote for each half of the year.
 *
 * The header is pinned as well as the three identity columns, so the teacher
 * names stay readable however far down a class you scroll — previously only the
 * columns were sticky and a long class turned into an anonymous field of boxes.
 */
export function GradeTable(props: GradeTableProps) {
  const { t } = useTranslation()
  const {
    classData,
    students,
    finalGrades,
    currentTeacherId,
    currentTeacherTeachesClass,
    currentSemester,
    semesterView,
    tablePeriod,
    getGrade,
    getFinalGradeDisplay,
    calculateAverage,
    hasMissingInCurrentSemester,
    onGradeChange,
    onFinalGradeChange,
    onConductWishChange,
    onDeleteTeacher,
    canManageSokrates = false,
    isSemesterMarked,
    isSemesterLocked,
    isCellLocked,
    isCellDrifted,
    onToggleColumnLock,
  } = props

  const showFirst = semesterView === 'first' || semesterView === 'both'
  const showSecond = semesterView === 'second' || semesterView === 'both'
  const semesters = ([showFirst && 'first', showSecond && 'second'] as const).filter(
    (s): s is Semester => Boolean(s),
  )

  const showAm = !tablePeriod || tablePeriod === 'AM'
  const showPm = !tablePeriod || tablePeriod === 'PM'
  const hasAm = classData.amTeachers.length > 0
  const hasPm = classData.pmTeachers.length > 0
  /** Only the combined view needs a visual divider between AM and PM. */
  const showSeparator = !tablePeriod && hasAm && hasPm
  /** With both halves on screen, mark where the first one ends. */
  const showSemesterDivider = semesterView === 'both'

  const deleteLabel = t('notensammler.deleteTeacherGrades', 'Alle Noten für diesen Lehrer löschen')

  /** Teacher columns rendered for a semester, in AM → separator → PM order. */
  const teacherColumns = useCallback(
    (semester: Semester) => {
      const columns: Array<{ teacher: Teacher; key: string } | { separator: true; key: string }> =
        []
      if (showAm) {
        for (const teacher of classData.amTeachers) {
          columns.push({ teacher, key: `${semester}-am-${teacher.id}` })
        }
      }
      if (showSeparator) columns.push({ separator: true, key: `${semester}-sep` })
      if (showPm) {
        for (const teacher of classData.pmTeachers) {
          columns.push({ teacher, key: `${semester}-pm-${teacher.id}` })
        }
      }
      return columns
    },
    [classData.amTeachers, classData.pmTeachers, showAm, showPm, showSeparator],
  )

  /** Shared look for every pinned heading cell. */
  const HEAD_CLASS = 'bg-muted sticky z-20 px-2 align-bottom'
  /** The identity columns pin in both axes, so they must sit above the rest. */
  const IDENTITY_HEAD_CLASS = cn(HEAD_CLASS, 'z-30')

  /** Sticky top offset for the teacher-name row, which sits under the group row. */
  const teacherRowStyle = { top: GROUP_ROW_HEIGHT }

  /** Period grouping plus the summary headings for one semester. */
  const renderSemesterHeads = (semester: Semester) => {
    const semesterLabel =
      semester === 'first'
        ? t('notensammler.firstSemester', '1. Semester')
        : t('notensammler.secondSemester', '2. Semester')
    const groupHeadClass = cn(HEAD_CLASS, 'border-border border-b text-center text-xs uppercase')
    const summaryHeadClass = cn(HEAD_CLASS, 'px-1 text-center text-xs font-semibold')
    // Side by side, the two halves are otherwise told apart only by a divider.
    const semesterPrefix = showSemesterDivider ? (
      <span className="text-primary font-semibold">
        {semester === 'first'
          ? t('notensammler.firstSemesterShort', '1. Sem')
          : t('notensammler.secondSemesterShort', '2. Sem')}
        {' · '}
      </span>
    ) : null

    return (
      <>
        {showAm && hasAm && (
          <TableHead
            colSpan={classData.amTeachers.length}
            className={groupHeadClass}
            style={{ top: 0, height: GROUP_ROW_HEIGHT }}
          >
            {semesterPrefix}
            {t('notensammler.vormittag', 'Vormittag')}
          </TableHead>
        )}
        {showSeparator && (
          <TableHead
            rowSpan={2}
            className={cn(HEAD_CLASS, 'border-border w-1 border-l-2 p-0')}
            style={{ top: 0 }}
            aria-hidden
          />
        )}
        {showPm && hasPm && (
          <TableHead
            colSpan={classData.pmTeachers.length}
            className={groupHeadClass}
            style={{ top: 0, height: GROUP_ROW_HEIGHT }}
          >
            {!(showAm && hasAm) && semesterPrefix}
            {t('notensammler.nachmittag', 'Nachmittag')}
          </TableHead>
        )}
        <TableHead
          rowSpan={2}
          className={cn(summaryHeadClass, 'w-14 min-w-14')}
          style={{ top: 0 }}
          title={`${t('notensammler.average', 'Durchschnitt')} (${semesterLabel})`}
        >
          Ø
        </TableHead>
        <TableHead
          rowSpan={2}
          className={cn(summaryHeadClass, 'text-primary w-[4.5rem] min-w-[4.5rem]')}
          style={{ top: 0 }}
          title={`${t('notensammler.endnote', 'Endnote')} (${semesterLabel})`}
        >
          {t('notensammler.endnote', 'Endnote')}
        </TableHead>
        <TableHead
          rowSpan={2}
          className={cn(
            summaryHeadClass,
            'w-[7.5rem] max-w-[7.5rem] min-w-[6.5rem]',
            semester === 'first' && showSemesterDivider && 'border-foreground/25 border-r-4',
          )}
          style={{ top: 0 }}
          title={t('notensammler.conductNoteWish', 'Betragensnote (Wunsch)')}
        >
          {t('notensammler.conductNoteWishShort', 'Betragen')}
        </TableHead>
      </>
    )
  }

  /** Grade cells for one student across one semester's teacher columns. */
  const renderGradeCells = (student: Student, semester: Semester, missing: boolean) =>
    teacherColumns(semester).map(column => {
      if ('separator' in column) {
        return (
          <TableCell key={`${student.id}-${column.key}`} className="border-border border-l-2 p-0" />
        )
      }
      const { teacher } = column
      const locked = isCellLocked?.(teacher.id, semester) ?? false
      const drifted = isCellDrifted?.(student.id, teacher.id, semester) ?? false
      const value = getGrade(student.id, teacher.id, semester)
      return (
        <TableCell
          key={`${student.id}-${column.key}`}
          className={cn(
            'w-20 min-w-20 px-1.5 py-1',
            currentTeacherId === teacher.id && 'bg-primary/5',
            // Only the gap itself is tinted. Tinting the whole row turned a
            // freshly opened class into a solid block of red, which says
            // "something is broken" rather than "these cells need a mark".
            missing && value === null && MISSING_CELL_CLASS,
            drifted && 'bg-warning/15 ring-warning ring-2 ring-inset',
          )}
          title={
            drifted
              ? t(
                  'notensammler.sokratesDrift',
                  'Nach Sokrates-Übertragung geändert — der Klassenleiter wurde informiert.',
                )
              : locked
                ? t('notensammler.sokratesCellLocked', 'In Sokrates eingetragen und gesperrt.')
                : undefined
          }
        >
          <GradeCombobox
            compact
            disabled={locked && !canManageSokrates}
            value={value}
            onChange={next => onGradeChange(student.id, teacher.id, semester, next)}
            aria-label={`${student.lastName} ${student.firstName} — ${teacher.lastName}`}
          />
        </TableCell>
      )
    })

  /** Average, Endnote and Betragensnote for one student and semester. */
  const renderSummaryCells = (student: Student, semester: Semester) => {
    const average = calculateAverage(student.id, semester, tablePeriod)
    const finalGrade = getFinalGradeDisplay(student.id, semester)
    const conductWish =
      (semester === 'first'
        ? finalGrades[student.id]?.conductWishFirst
        : finalGrades[student.id]?.conductWishSecond) ?? CONDUCT_NOTE_WISH_DEFAULT
    // Endnote and Betragensnote belong to the class, not to a teacher column, so
    // only the blanket Sokrates lock reaches them. The server refuses these
    // writes either way; disabling here is so nobody types into a dead cell.
    const summaryLocked = (isSemesterLocked?.(semester) ?? false) && !canManageSokrates

    return (
      <>
        <TableCell
          className={cn(
            'bg-muted/50 w-14 min-w-14 px-1.5 py-1 text-center font-medium tabular-nums',
          )}
        >
          {average === null ? '–' : typeof average === 'string' ? average : average.toFixed(1)}
        </TableCell>
        <TableCell
          className={cn('bg-primary/5 w-[4.5rem] min-w-[4.5rem] px-1.5 py-1')}
          title={
            summaryLocked
              ? t('notensammler.sokratesCellLocked', 'In Sokrates eingetragen und gesperrt.')
              : finalGrade != null
                ? getGradeDisplayText(finalGrade)
                : '-'
          }
        >
          <GradeCombobox
            compact
            variant="endnote"
            value={finalGrade}
            disabled={summaryLocked}
            onChange={value => onFinalGradeChange(student.id, semester, value)}
            aria-label={`Endnote ${student.lastName} ${student.firstName}`}
          />
        </TableCell>
        <TableCell
          className={cn(
            'bg-primary/5 w-[7.5rem] max-w-[7.5rem] min-w-[6.5rem] px-1.5 py-1',
            semester === 'first' && showSemesterDivider && 'border-foreground/25 border-r-4',
          )}
          title={
            summaryLocked
              ? t('notensammler.sokratesCellLocked', 'In Sokrates eingetragen und gesperrt.')
              : conductWish === CONDUCT_NOTE_WISH_NONE
                ? '-'
                : conductWish
          }
        >
          <Select
            value={conductWish}
            disabled={summaryLocked}
            onValueChange={value => onConductWishChange(student.id, semester, value)}
          >
            <SelectTrigger className="h-7 w-full max-w-full min-w-0 truncate text-xs">
              <SelectValue placeholder="-" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CONDUCT_NOTE_WISH_NONE}>-</SelectItem>
              {CONDUCT_NOTE_WISH_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
      </>
    )
  }

  return (
    <Table
      containerClassName="border-border/60 max-h-[min(70vh,44rem)] rounded-lg border"
      className="border-collapse"
    >
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead
            rowSpan={2}
            className={cn(IDENTITY_HEAD_CLASS, 'w-10 min-w-10 text-center')}
            style={{ top: 0, left: STICKY_LEFT.index }}
            title={t('notensammler.id', 'ID')}
          >
            #
          </TableHead>
          <TableHead
            rowSpan={2}
            className={cn(IDENTITY_HEAD_CLASS, 'w-10 min-w-10 text-center')}
            style={{ top: 0, left: STICKY_LEFT.group }}
            title={t('notensammler.group', 'Gruppe')}
          >
            {t('notensammler.groupShort', 'Gr.')}
          </TableHead>
          <TableHead
            rowSpan={2}
            className={cn(
              IDENTITY_HEAD_CLASS,
              // A drawn border on a sticky cell disappears under border-collapse
              // once the column scrolls; a shadow rides along with it.
              'w-[13rem] min-w-[13rem] text-left shadow-[1px_0_0_0_var(--color-border)]',
            )}
            style={{ top: 0, left: STICKY_LEFT.name }}
          >
            {t('notensammler.student', 'Schüler')}
          </TableHead>
          {semesters.map(semester => (
            <Fragment key={semester}>{renderSemesterHeads(semester)}</Fragment>
          ))}
        </TableRow>
        <TableRow className="hover:bg-transparent">
          {semesters.flatMap(semester =>
            teacherColumns(semester).map(column =>
              'separator' in column ? null : (
                <TeacherColumnHeader
                  key={column.key}
                  teacher={column.teacher}
                  isCurrentTeacher={currentTeacherId === column.teacher.id}
                  onDelete={onDeleteTeacher}
                  deleteLabel={deleteLabel}
                  stickyStyle={teacherRowStyle}
                  showLock={canManageSokrates && (isSemesterMarked?.(semester) ?? false)}
                  locked={isCellLocked?.(column.teacher.id, semester) ?? false}
                  onToggleLock={locked => onToggleColumnLock?.(column.teacher.id, semester, locked)}
                />
              ),
            ),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student, index) => {
          // Missing-grade highlighting only makes sense for a teacher of this class.
          const missing = currentTeacherTeachesClass && hasMissingInCurrentSemester(student.id)
          const missingFirst = missing && currentSemester === 'first'
          const missingSecond = missing && currentSemester === 'second'
          // The gap is in the live semester. Flagging the row while a different
          // half is on screen points at cells the teacher cannot even see.
          const missingVisible = (showFirst && missingFirst) || (showSecond && missingSecond)
          const stickyCell = 'sticky z-10 bg-inherit px-2 py-1'

          return (
            <TableRow
              key={student.id}
              // The row background must be fully opaque, and the pinned cells
              // inherit it: with a translucent one (a /25 zebra, the default
              // /50 hover) the columns scrolling underneath showed through the
              // pinned name column.
              className="bg-card hover:bg-muted"
            >
              <TableCell
                className={cn(
                  stickyCell,
                  'w-10 min-w-10 text-center font-medium tabular-nums',
                  // A row with a gap gets an edge marker rather than a fill:
                  // it survives horizontal scrolling, since this column is
                  // pinned, and it stays legible next to the zebra striping.
                  missingVisible && 'border-warning border-l-4 pl-1',
                )}
                style={{ left: STICKY_LEFT.index }}
              >
                {index + 1}
              </TableCell>
              <TableCell
                className={cn(stickyCell, 'w-10 min-w-10 text-center tabular-nums')}
                style={{ left: STICKY_LEFT.group }}
              >
                {student.groupId ?? '–'}
              </TableCell>
              <TableCell
                className={cn(
                  stickyCell,
                  'w-[13rem] max-w-[13rem] font-medium shadow-[1px_0_0_0_var(--color-border)]',
                )}
                style={{ left: STICKY_LEFT.name }}
              >
                <StudentPhoto
                  studentId={student.id}
                  firstName={student.firstName}
                  lastName={student.lastName}
                  size={30}
                  nameFormat="lastFirst"
                />
              </TableCell>
              {showFirst && (
                <>
                  {renderGradeCells(student, 'first', missingFirst)}
                  {renderSummaryCells(student, 'first')}
                </>
              )}
              {showSecond && (
                <>
                  {renderGradeCells(student, 'second', missingSecond)}
                  {renderSummaryCells(student, 'second')}
                </>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
