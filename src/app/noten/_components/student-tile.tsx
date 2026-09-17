'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Armchair, NotebookPen } from 'lucide-react'
import { StudentPhoto } from '@/components/student-photo'
import { ATTENDANCE_OPTIONS, getGradeBoxClass } from '@/lib/grades'
import { cn } from '@/lib/utils'
import {
  CATEGORIES,
  type ActiveCell,
  type CategoryKey,
  GRADE_STEPS,
  categoryField,
  fmtGrade,
  roundHalf,
} from '../_lib/erfassen'
import type { NotenEntryRow, Student } from '../_lib/types'

const HIDDEN = '•••'

/**
 * A note box that keeps its own text and only writes back when it loses focus.
 * Remounted (via a key on the day) when the day changes, so it always opens on
 * the current day's note rather than re-seeding through an effect.
 */
function NoteField({
  initialValue,
  onCommit,
}: {
  initialValue: string
  onCommit: (value: string) => void
}) {
  const { t } = useTranslation('common')
  const [value, setValue] = useState(initialValue)

  return (
    <textarea
      rows={2}
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initialValue) onCommit(value)
      }}
      placeholder={t('noten.notePlaceholder', { defaultValue: 'Notiz zu diesem Tag' })}
      className="border-input bg-card text-foreground w-full resize-y rounded-md border p-2 text-xs shadow-xs"
    />
  )
}

export type StudentTileProps = {
  student: Student
  entry: NotenEntryRow
  /** `${date}-${period}` of the shown day — remounts the note field on change. */
  dayKey: string
  hideGrades: boolean
  /** The focused category cell in this tile, if any (for pad + keyboard). */
  active: { category: CategoryKey; slot: 1 | 2 } | null
  slot2Open: boolean
  noteOpen: boolean
  avg: number | null
  absent: number
  onSetAttendance: (value: string) => void
  onFocusCell: (cell: ActiveCell | null) => void
  onSetMark: (category: CategoryKey, slot: 1 | 2, value: number | null) => void
  onToggleSlot2: () => void
  onToggleNote: () => void
  onCommitNote: (value: string) => void
  onSitzplatzChange: (value: string | null) => void
}

export function StudentTile({
  student,
  entry,
  dayKey,
  hideGrades,
  active,
  slot2Open,
  noteOpen,
  avg,
  absent,
  onSetAttendance,
  onFocusCell,
  onSetMark,
  onToggleSlot2,
  onToggleNote,
  onCommitNote,
  onSitzplatzChange,
}: StudentTileProps) {
  const { t } = useTranslation('common')
  const hasNote = !!entry.notizen?.trim()
  const attended = !!entry.attendance
  const name = `${student.lastName}, ${student.firstName}`

  const catRow = (slot: 1 | 2) => (
    <div className="grid grid-cols-4 gap-1">
      {CATEGORIES.map(cat => {
        const value = entry[categoryField(cat.key, slot)] as number | null
        const isActive = active?.category === cat.key && active.slot === slot
        const tinted = !hideGrades && value != null
        return (
          <button
            key={cat.key}
            type="button"
            title={t(cat.fullKey) + (slot === 2 ? ' · 2. Note' : '')}
            onClick={() => onFocusCell(isActive ? null : { studentId: student.id, category: cat.key, slot })}
            className={cn(
              'flex h-[46px] flex-col items-center justify-center gap-0.5 rounded-sm border transition-colors',
              value == null && !isActive && 'border-input border-dashed',
              tinted && getGradeBoxClass(roundHalf(value)),
              isActive
                ? 'border-primary ring-ring bg-primary/[.08] ring-[3px]'
                : value != null
                  ? ''
                  : 'shadow-xs',
            )}
          >
            <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
              {t(cat.shortKey)}
            </span>
            <span className="text-base leading-none font-semibold tabular-nums">
              {hideGrades ? HIDDEN : fmtGrade(value)}
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <div
      className={cn(
        'bg-card flex flex-col gap-2 rounded-lg border p-3 shadow-sm',
        active ? 'border-primary' : attended ? 'border-border' : 'border-border/60 bg-muted/[.18]',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          title={t('noten.sitzplatz', { defaultValue: 'Sitzplatz' })}
          className="bg-muted text-muted-foreground flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs font-semibold"
        >
          <Armchair className="h-3 w-3" aria-hidden />
          <input
            value={student.sitzplatz ?? ''}
            onChange={e => onSitzplatzChange(e.target.value || null)}
            aria-label={`${t('noten.sitzplatz', { defaultValue: 'Sitzplatz' })}: ${name}`}
            className="w-7 bg-transparent text-center tabular-nums outline-none"
          />
        </span>
        <StudentPhoto
          studentId={student.id}
          firstName={student.firstName}
          lastName={student.lastName}
          avatarOnly
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
        <button
          type="button"
          onClick={onToggleNote}
          title={t('noten.notiz', { defaultValue: 'Notiz' })}
          aria-pressed={noteOpen}
          className={cn(
            'flex shrink-0 rounded-sm border p-1.5 transition-colors',
            hasNote
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'text-muted-foreground border-transparent hover:bg-accent',
          )}
        >
          <NotebookPen className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {ATTENDANCE_OPTIONS.map(option => {
          const on = entry.attendance === option
          const good = option === 'Anwesend'
          return (
            <button
              key={option}
              type="button"
              onClick={() => onSetAttendance(option)}
              title={option}
              aria-pressed={on}
              className={cn(
                'flex h-8 items-center justify-center rounded-sm border text-xs font-semibold transition-colors',
                on
                  ? good
                    ? 'border-success/45 bg-success/[.14] text-foreground'
                    : 'border-destructive/45 bg-destructive/[.14] text-foreground'
                  : 'border-input text-muted-foreground hover:bg-accent',
              )}
            >
              {option.charAt(0)}
            </button>
          )
        })}
      </div>

      {catRow(1)}
      {slot2Open && catRow(2)}

      {active && (
        <div className="bg-muted/[.45] flex flex-col gap-1.5 rounded-md p-2">
          <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
            {t(CATEGORIES.find(c => c.key === active.category)!.fullKey)}
          </span>
          <div className="flex flex-wrap gap-1">
            {[null, ...GRADE_STEPS].map(step => (
              <button
                key={step ?? 'clear'}
                type="button"
                onClick={() => onSetMark(active.category, active.slot, step)}
                className={cn(
                  'h-[30px] min-w-[34px] rounded-sm border px-1.5 text-sm tabular-nums transition-colors',
                  step == null
                    ? 'border-input bg-card'
                    : cn('border-input', getGradeBoxClass(step)),
                )}
              >
                {step == null ? '–' : fmtGrade(step)}
              </button>
            ))}
          </div>
          <span className="text-muted-foreground text-[10px]">
            {t('noten.digitPadHint', {
              defaultValue:
                'Tastatur: 1–5 tippen, nochmal drücken ergibt die halbe Note. Backspace löscht.',
            })}
          </span>
        </div>
      )}

      {noteOpen && (
        <NoteField key={dayKey} initialValue={entry.notizen ?? ''} onCommit={onCommitNote} />
      )}

      <div className="border-border/60 mt-0.5 flex items-center justify-between gap-2 border-t pt-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          {t('noten.avgShort', { defaultValue: 'Ø' })} {hideGrades ? HIDDEN : fmtGrade(avg)} ·{' '}
          {t('noten.fehltage', { count: absent, defaultValue: `${absent} Fehltage` })}
        </span>
        <button
          type="button"
          onClick={onToggleSlot2}
          className="text-muted-foreground hover:text-primary text-xs transition-colors"
        >
          {slot2Open
            ? t('noten.secondNoteRemove', { defaultValue: '− 2. Note' })
            : t('noten.secondNoteAdd', { defaultValue: '+ 2. Note' })}
        </button>
      </div>
    </div>
  )
}
