'use client'

import { useTranslation } from 'react-i18next'
import { ClipboardList } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StudentPhoto } from '@/components/student-photo'
import {
  ALLOWED_FINAL_GRADES,
  CONDUCT_NOTE_WISH_OPTIONS,
  GESTUNDEN,
  GRADE_CLEAR_VALUE,
  NICHT_BEURTEILT,
  getGradeBoxClass,
} from '@/lib/grades'
import { cn } from '@/lib/utils'
import { fmtGrade, roundHalf } from '../_lib/erfassen'
import type { FinalGradePerStudent, Student } from '../_lib/types'
import type { StudentSummary } from '../_lib/summary'

const HEAD = 'bg-muted border-border flex h-9 items-center border-b px-3 text-[11px] font-medium'
const CELL = 'border-border/60 flex items-center border-b px-3 py-2'

/**
 * Final grade and Betragen per semester, with the calculated average as a
 * non-binding suggestion. Writes flow through the shared saveFinalGrades path,
 * so a licensed Notensammler still routes the mark to the Grade table and the
 * Betragensnote to FinalGrade — this screen only supplies the values.
 */
export function EndnotenTab({
  students,
  finalGrades,
  summary,
  hideGrades,
  onFinalGradeChange,
  onFinalGradeCommit,
}: {
  students: Student[]
  finalGrades: Record<number, FinalGradePerStudent>
  summary: Record<number, StudentSummary>
  hideGrades: boolean
  onFinalGradeChange: (
    studentId: number,
    semester: 'first' | 'second',
    field: 'grade' | 'conductNoteWish',
    value: number | string | null,
  ) => void
  onFinalGradeCommit: (studentId: number) => void
}) {
  const { t } = useTranslation('common')

  const endGradeLabel = (grade: number) =>
    grade === NICHT_BEURTEILT
      ? t('noten.gradeNichtBeurteilt', { defaultValue: 'Nicht beurteilt' })
      : grade === GESTUNDEN
        ? t('noten.gradeGestundet', { defaultValue: 'Gestundet' })
        : String(grade)

  const finalSelect = (
    studentId: number,
    semester: 'first' | 'second',
    field: 'grade' | 'conductNoteWish',
    value: number | string | null,
  ) => {
    const isGrade = field === 'grade'
    return (
      <Select
        value={value != null ? String(value) : ''}
        onValueChange={v =>
          onFinalGradeChange(
            studentId,
            semester,
            field,
            isGrade ? (v === GRADE_CLEAR_VALUE || v === '' ? null : parseFloat(v)) : v || null,
          )
        }
        onOpenChange={open => {
          if (!open) onFinalGradeCommit(studentId)
        }}
      >
        <SelectTrigger className="h-8 w-full min-w-0 px-2">
          <SelectValue placeholder="–" />
        </SelectTrigger>
        <SelectContent>
          {isGrade && <SelectItem value={GRADE_CLEAR_VALUE}>–</SelectItem>}
          {isGrade
            ? ALLOWED_FINAL_GRADES.map(grade => (
                <SelectItem key={grade} value={String(grade)}>
                  {endGradeLabel(grade)}
                </SelectItem>
              ))
            : CONDUCT_NOTE_WISH_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
        </SelectContent>
      </Select>
    )
  }

  const headers = [
    t('noten.name'),
    t('noten.avgShort', { defaultValue: 'Ø' }),
    t('noten.endnoteSem1', { defaultValue: 'Endnote 1. Semester' }),
    t('noten.betragenSem1', { defaultValue: 'Betragen 1. Semester' }),
    t('noten.endnoteSem2', { defaultValue: 'Endnote 2. Semester' }),
    t('noten.betragenSem2', { defaultValue: 'Betragen 2. Semester' }),
  ]

  return (
    <div className="border-border bg-card overflow-hidden rounded-lg border shadow-sm">
      <div className="border-border flex items-center gap-2 border-b px-5 py-4">
        <ClipboardList className="h-4 w-4" />
        <span className="text-base font-semibold">
          {t('noten.endnotenTitle', { defaultValue: 'Endnoten & Betragen' })}
        </span>
        <span className="text-muted-foreground ml-auto text-xs">
          {t('noten.endnotenHint', { defaultValue: 'Vorschlag aus dem Durchschnitt, überschreibbar' })}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid text-sm"
          style={{
            gridTemplateColumns: '240px 90px 120px 200px 120px 200px',
            width: 'max-content',
            minWidth: '100%',
          }}
        >
          {headers.map((label, i) => (
            <div key={label} className={cn(HEAD, i > 0 && 'justify-center')}>
              {label}
            </div>
          ))}

          {students.map(student => {
            const final = finalGrades[student.id] ?? {
              first: { grade: null, conductNoteWish: null },
              second: { grade: null, conductNoteWish: null },
            }
            const calc = summary[student.id]?.calculatedGrade ?? null
            return (
              <div key={student.id} className="contents">
                <div className={cn(CELL, 'gap-2')}>
                  <StudentPhoto
                    studentId={student.id}
                    firstName={student.firstName}
                    lastName={student.lastName}
                    avatarOnly
                  />
                  <span className="truncate whitespace-nowrap">
                    {student.lastName}, {student.firstName}
                  </span>
                </div>
                <div className={cn(CELL, 'justify-center')}>
                  <span
                    className={cn(
                      'border-input flex h-7 min-w-[40px] items-center justify-center rounded-md border px-2 text-sm font-medium tabular-nums',
                      !hideGrades && calc != null && getGradeBoxClass(roundHalf(calc)),
                    )}
                  >
                    {hideGrades ? '•••' : fmtGrade(calc)}
                  </span>
                </div>
                <div className={cn(CELL, 'justify-center')}>
                  {finalSelect(student.id, 'first', 'grade', final.first.grade)}
                </div>
                <div className={cn(CELL, 'justify-center')}>
                  {finalSelect(student.id, 'first', 'conductNoteWish', final.first.conductNoteWish)}
                </div>
                <div className={cn(CELL, 'justify-center')}>
                  {finalSelect(student.id, 'second', 'grade', final.second.grade)}
                </div>
                <div className={cn(CELL, 'justify-center')}>
                  {finalSelect(student.id, 'second', 'conductNoteWish', final.second.conductNoteWish)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
