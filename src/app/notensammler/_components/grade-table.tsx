'use client'

import { useCallback } from 'react'
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
import type { ClassData, FinalGradesData, Period, Student, Teacher } from '../_lib/types'
import { TeacherColumnHeader } from './teacher-column-header'

const MISSING_CELL_CLASS = 'bg-destructive/10'

export type GradeTableProps = {
  classData: ClassData
  students: Student[]
  finalGrades: FinalGradesData
  currentTeacherId: number | null
  currentTeacherTeachesClass: boolean
  currentSemester: Semester | null
  showFirstSemester: boolean
  showSecondSemester: boolean
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
    showFirstSemester,
    showSecondSemester,
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

  const showAm = !tablePeriod || tablePeriod === 'AM'
  const showPm = !tablePeriod || tablePeriod === 'PM'
  const hasAm = classData.amTeachers.length > 0
  const hasPm = classData.pmTeachers.length > 0
  /** Only the combined view needs a visual divider between AM and PM. */
  const showSeparator = !tablePeriod && hasAm && hasPm

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

  const renderPeriodLabels = (visible: boolean) => (
    <>
      {visible && showAm && hasAm && (
        <TableHead colSpan={classData.amTeachers.length} className="border-b text-center">
          {t('notensammler.vormittag', 'Vormittag')}
        </TableHead>
      )}
      {visible && showSeparator && (
        <TableHead rowSpan={2} className="border-muted-foreground/30 w-1 border-l-2 p-0" />
      )}
      {visible && showPm && hasPm && (
        <TableHead colSpan={classData.pmTeachers.length} className="border-b text-center">
          {t('notensammler.nachmittag', 'Nachmittag')}
        </TableHead>
      )}
    </>
  )

  const renderSummaryHeads = (semester: Semester) => {
    const semesterLabel =
      semester === 'first'
        ? t('notensammler.firstSemester', '1. Semester')
        : t('notensammler.secondSemester', '2. Semester')
    const endnoteLabel =
      semester === 'first'
        ? t('notensammler.endnoteFirstSemester', 'Endnote (1. Semester)')
        : t('notensammler.endnoteSecondSemester', 'Endnote (2. Semester)')
    return (
      <>
        <TableHead rowSpan={2} className="bg-muted w-14 min-w-14 p-1 text-center">
          <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
            {t('notensammler.average', 'Durchschnitt')} ({semesterLabel})
          </span>
        </TableHead>
        <TableHead rowSpan={2} className="bg-primary/10 w-14 min-w-14 p-1 text-center">
          <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
            {endnoteLabel}
          </span>
        </TableHead>
        <TableHead
          rowSpan={2}
          className={cn(
            'bg-primary/5 w-[105px] max-w-[105px] min-w-[90px] p-1 text-center',
            semester === 'first' && 'border-muted-foreground/60 border-r-4',
          )}
        >
          <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
            {t('notensammler.conductNoteWish', 'Betragensnote (Wunsch)')}
          </span>
        </TableHead>
      </>
    )
  }

  /** Grade cells for one student across one semester's teacher columns. */
  const renderGradeCells = (student: Student, semester: Semester, missing: boolean) =>
    teacherColumns(semester).map(column => {
      if ('separator' in column) {
        return (
          <TableCell
            key={`${student.id}-${column.key}`}
            className={cn(
              'border-muted-foreground/30 border-l-2 p-0',
              missing && MISSING_CELL_CLASS,
            )}
          />
        )
      }
      const { teacher } = column
      const locked = isCellLocked?.(teacher.id, semester) ?? false
      const drifted = isCellDrifted?.(student.id, teacher.id, semester) ?? false
      return (
        <TableCell
          key={`${student.id}-${column.key}`}
          className={cn(
            'w-16 min-w-16 p-1',
            currentTeacherId === teacher.id && 'bg-primary/10',
            missing && MISSING_CELL_CLASS,
            drifted && 'bg-amber-100 ring-2 ring-amber-500 ring-inset dark:bg-amber-950/50',
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
            value={getGrade(student.id, teacher.id, semester)}
            onChange={value => onGradeChange(student.id, teacher.id, semester, value)}
            aria-label={`${student.lastName} ${student.firstName} — ${teacher.lastName}`}
          />
        </TableCell>
      )
    })

  /** Average, Endnote and Betragensnote for one student and semester. */
  const renderSummaryCells = (student: Student, semester: Semester, missing: boolean) => {
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
            'w-14 min-w-14 p-1 text-center font-medium',
            missing ? MISSING_CELL_CLASS : 'bg-muted',
          )}
        >
          {average === null ? '-' : typeof average === 'string' ? average : average.toFixed(1)}
        </TableCell>
        <TableCell
          className={cn('bg-primary/10 w-14 min-w-14 p-1', missing && MISSING_CELL_CLASS)}
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
            'bg-primary/5 w-[105px] max-w-[105px] min-w-[90px] p-1',
            semester === 'first' && 'border-muted-foreground/60 border-r-4',
            missing && MISSING_CELL_CLASS,
          )}
          title={conductWish === CONDUCT_NOTE_WISH_NONE ? '-' : conductWish}
        >
          <Select
            value={conductWish}
            disabled={summaryLocked}
            onValueChange={value => onConductWishChange(student.id, semester, value)}
          >
            <SelectTrigger className="h-8 w-full max-w-full min-w-0 truncate text-sm">
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
    <div className="overflow-x-auto">
      <Table className="border-collapse">
        <TableHeader>
          <TableRow>
            <TableHead
              rowSpan={2}
              className="bg-background sticky left-0 z-10 w-10 min-w-10 p-1 text-center"
            >
              <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                {t('notensammler.id', 'ID')}
              </span>
            </TableHead>
            <TableHead
              rowSpan={2}
              className="bg-background sticky left-10 z-10 w-10 min-w-10 p-1 text-center"
            >
              <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
                {t('notensammler.group', 'Gruppe')}
              </span>
            </TableHead>
            <TableHead rowSpan={2} className="bg-background sticky left-[5rem] z-10 w-[200px]">
              {t('notensammler.student', 'Schüler')}
            </TableHead>
            {renderPeriodLabels(showFirstSemester)}
            {renderSummaryHeads('first')}
            {renderPeriodLabels(showSecondSemester)}
            {renderSummaryHeads('second')}
          </TableRow>
          <TableRow>
            {showFirstSemester &&
              teacherColumns('first').map(column =>
                'separator' in column ? null : (
                  <TeacherColumnHeader
                    key={column.key}
                    teacher={column.teacher}
                    isCurrentTeacher={currentTeacherId === column.teacher.id}
                    onDelete={onDeleteTeacher}
                    deleteLabel={deleteLabel}
                    showLock={canManageSokrates && (isSemesterMarked?.('first') ?? false)}
                    locked={isCellLocked?.(column.teacher.id, 'first') ?? false}
                    onToggleLock={locked =>
                      onToggleColumnLock?.(column.teacher.id, 'first', locked)
                    }
                  />
                ),
              )}
            {showSecondSemester &&
              teacherColumns('second').map(column =>
                'separator' in column ? null : (
                  <TeacherColumnHeader
                    key={column.key}
                    teacher={column.teacher}
                    isCurrentTeacher={currentTeacherId === column.teacher.id}
                    onDelete={onDeleteTeacher}
                    deleteLabel={deleteLabel}
                    showLock={canManageSokrates && (isSemesterMarked?.('second') ?? false)}
                    locked={isCellLocked?.(column.teacher.id, 'second') ?? false}
                    onToggleLock={locked =>
                      onToggleColumnLock?.(column.teacher.id, 'second', locked)
                    }
                  />
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

            return (
              <TableRow key={student.id}>
                <TableCell className="bg-background sticky left-0 z-10 w-10 min-w-10 p-1 text-center font-medium">
                  {index + 1}
                </TableCell>
                <TableCell className="bg-background sticky left-10 z-10 w-10 min-w-10 p-1 text-center">
                  {student.groupId ?? '-'}
                </TableCell>
                <TableCell className="bg-background sticky left-[5rem] z-10 w-[200px] max-w-[200px] font-medium">
                  <StudentPhoto
                    studentId={student.id}
                    firstName={student.firstName}
                    lastName={student.lastName}
                    size={32}
                    nameFormat="lastFirst"
                  />
                </TableCell>
                {showFirstSemester && renderGradeCells(student, 'first', missingFirst)}
                {renderSummaryCells(student, 'first', missingFirst)}
                {showSecondSemester && renderGradeCells(student, 'second', missingSecond)}
                {renderSummaryCells(student, 'second', missingSecond)}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
