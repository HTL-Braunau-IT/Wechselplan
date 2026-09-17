'use client'

import { useTranslation } from 'react-i18next'
import { ListChecks } from 'lucide-react'
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
  CONDUCT_NOTE_WISH_NONE,
  CONDUCT_NOTE_WISH_OPTIONS,
  GESTUNDEN,
  NICHT_BEURTEILT,
  getGradeBoxClass,
} from '@/lib/grades'
import { fmtGrade } from '@/app/noten/_lib/erfassen'
import type { Student } from '../_lib/types'
import { GradeButtons } from './grade-buttons'

/** A mark as it fits a 46px box: sentinels shortened, marks with a decimal comma. */
function shortMark(mark: number | null): string {
  if (mark == null) return '–'
  if (mark === NICHT_BEURTEILT) return 'nb'
  if (mark === GESTUNDEN) return 'gs'
  return fmtGrade(mark)
}

/** A small stacked column label, shown only on the focused row so it reads as a header. */
function ColumnLabel({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null
  return (
    <span className="text-muted-foreground text-[11px] tracking-wide uppercase">{children}</span>
  )
}

export type EntryRowProps = {
  /** 1-based position in the full alphabetical roster (stable across the split). */
  index: number
  student: Student
  mark: number | null
  /** Other visible-period teachers' marks for this student/semester. */
  colleagues: number[]
  average: number | string | null
  endnote: number | null
  conductWish: string
  suggestion: number | null
  focused: boolean
  variant: 'open' | 'done'
  containerRef?: (el: HTMLDivElement | null) => void
  onFocus: () => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
  onGradeChange: (value: string) => void
  onFinalGradeChange: (value: string) => void
  onConductWishChange: (value: string) => void
  markLocked?: boolean
  summaryLocked?: boolean
}

/**
 * One student in the entry roster. The left half (number, group, name) and the
 * right cluster (colleagues, Ø, Endnote, Betragen) are identical across states;
 * the middle "mark" area is what changes: the focused row shows the full grade
 * palette, other open rows a dashed box with a "übernehmen" suggestion, and done
 * rows the filled, grade-tinted mark.
 */
export function EntryRow({
  index,
  student,
  mark,
  colleagues,
  average,
  endnote,
  conductWish,
  suggestion,
  focused,
  variant,
  containerRef,
  onFocus,
  onKeyDown,
  onGradeChange,
  onFinalGradeChange,
  onConductWishChange,
  markLocked = false,
  summaryLocked = false,
}: EntryRowProps) {
  const { t } = useTranslation()
  const groupId = student.groupId
  const averageText =
    average == null ? '–' : typeof average === 'string' ? average : fmtGrade(average)

  return (
    <div
      ref={containerRef}
      tabIndex={variant === 'open' ? 0 : -1}
      onFocus={onFocus}
      onClick={onFocus}
      onKeyDown={onKeyDown}
      className={cn(
        'flex items-center gap-4 py-2.5 pr-5 outline-none',
        variant === 'open' ? 'border-warning border-l-[3px] pl-[17px]' : 'pl-5',
        'border-border/60 border-t first:border-t-0',
        focused && 'bg-primary/[0.04] ring-ring ring-2 ring-inset',
      )}
    >
      <span className="text-muted-foreground w-[22px] shrink-0 text-sm tabular-nums">{index}</span>

      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-xs font-semibold tabular-nums"
        style={
          groupId != null
            ? { background: `var(--group-${groupId}-tint)`, color: `var(--group-${groupId}-ink)` }
            : { background: 'var(--muted)', color: 'var(--muted-foreground)' }
        }
      >
        {groupId ?? '–'}
      </span>

      <span className="flex w-[240px] min-w-[240px] items-center">
        <StudentPhoto
          studentId={student.id}
          firstName={student.firstName}
          lastName={student.lastName}
          size={32}
          nameFormat="lastFirst"
        />
      </span>

      {/* Mark area — the one part that differs by state. */}
      {focused ? (
        <span className="flex items-center gap-1.5">
          {suggestion != null && mark == null && (
            <SuggestionChip
              suggestion={suggestion}
              onAccept={() => onGradeChange(String(suggestion))}
              withKey
            />
          )}
          <GradeButtons value={mark} onPick={onGradeChange} disabled={markLocked} />
        </span>
      ) : variant === 'done' ? (
        <span
          className={cn(
            'flex h-[30px] w-[46px] shrink-0 items-center justify-center rounded-md border text-sm font-semibold tabular-nums',
            getGradeBoxClass(mark) || 'border-border',
          )}
        >
          {shortMark(mark)}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="border-warning bg-warning/10 text-warning-foreground flex h-[30px] w-[46px] shrink-0 items-center justify-center rounded-md border border-dashed text-sm">
            –
          </span>
          {suggestion != null && (
            <SuggestionChip
              suggestion={suggestion}
              onAccept={() => onGradeChange(String(suggestion))}
            />
          )}
        </span>
      )}

      {/* Right cluster — fixed widths so the columns line up without a table. */}
      <span className="ml-auto flex items-center gap-5">
        <span className="flex flex-col items-end gap-0.5">
          <ColumnLabel show={focused}>{t('notensammler.colleagues', 'Kollegen')}</ColumnLabel>
          <span className="flex items-center gap-0.5">
            {colleagues.length === 0 ? (
              <span className="text-muted-foreground text-xs">–</span>
            ) : (
              colleagues.map((colleagueMark, i) => (
                <span
                  key={i}
                  className="bg-muted text-muted-foreground inline-flex h-5 min-w-[22px] items-center justify-center rounded-sm px-1 text-[11px] font-semibold tabular-nums"
                >
                  {shortMark(colleagueMark)}
                </span>
              ))
            )}
          </span>
        </span>

        <span className="flex w-11 flex-col items-end gap-0.5">
          <ColumnLabel show={focused}>Ø</ColumnLabel>
          <span className="text-sm font-medium tabular-nums">{averageText}</span>
        </span>

        <span className="flex flex-col items-start gap-0.5">
          <ColumnLabel show={focused}>{t('notensammler.endnote', 'Endnote')}</ColumnLabel>
          <GradeCombobox
            compact
            variant="endnote"
            value={endnote}
            disabled={summaryLocked}
            onChange={onFinalGradeChange}
            aria-label={`${t('notensammler.endnote', 'Endnote')} ${student.lastName} ${student.firstName}`}
          />
        </span>

        <span className="flex w-[172px] flex-col items-start gap-0.5">
          <ColumnLabel show={focused}>
            {t('notensammler.conductNoteWishShort', 'Betragen')}
          </ColumnLabel>
          <Select value={conductWish} disabled={summaryLocked} onValueChange={onConductWishChange}>
            <SelectTrigger className="h-[26px] w-full min-w-0 truncate text-xs">
              <SelectValue placeholder="–" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CONDUCT_NOTE_WISH_NONE}>–</SelectItem>
              {CONDUCT_NOTE_WISH_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      </span>
    </div>
  )
}

/** The "Notenliste X" pill — a Tab hint on the focused row, "übernehmen" elsewhere. */
function SuggestionChip({
  suggestion,
  onAccept,
  withKey = false,
}: {
  suggestion: number
  onAccept: () => void
  withKey?: boolean
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onAccept}
      className="border-primary/40 bg-primary/[0.07] inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2 text-xs whitespace-nowrap"
    >
      <ListChecks className="text-primary h-3.5 w-3.5" aria-hidden />
      <span className="text-muted-foreground">{t('notensammler.notenliste', 'Notenliste')}</span>
      <strong className="font-semibold tabular-nums">{fmtGrade(suggestion)}</strong>
      {withKey ? (
        <span className="border-border bg-card text-muted-foreground ml-0.5 inline-flex h-[18px] items-center rounded border px-1 text-[11px] font-medium">
          Tab
        </span>
      ) : (
        <span className="text-primary font-medium">{t('notensammler.accept', 'übernehmen')}</span>
      )}
    </button>
  )
}
