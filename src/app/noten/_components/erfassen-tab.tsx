'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, BookOpen, Check, Eye, EyeOff, Sun, Sunset } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Hint } from '@/components/hint'
import { entryKey, isSemester2 } from '@/lib/grades'
import { cn } from '@/lib/utils'
import { DayPickerStrip } from './day-picker-strip'
import { StudentTile } from './student-tile'
import { WeightsPopover } from './weights-popover'
import {
  type ActiveCell,
  type CategoryKey,
  categoryField,
} from '../_lib/erfassen'
import { emptyEntry, type NotenEntryRow, type Student, type TeachingDay, type WeightConfig } from '../_lib/types'
import type { StudentSummary } from '../_lib/summary'

/** Long German date, e.g. "Montag, 9. November 2026", from a local YYYY-MM-DD. */
function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1)
  return new Intl.DateTimeFormat('de-AT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt)
}

/** Lehrstoff field that keeps its own text and writes back on blur. */
function LehrstoffInput({
  initialValue,
  onCommit,
}: {
  initialValue: string
  onCommit: (value: string) => void
}) {
  const { t } = useTranslation('common')
  const [value, setValue] = useState(initialValue)
  return (
    <input
      type="text"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        if (value !== initialValue) onCommit(value)
      }}
      placeholder={t('noten.lehrstoffPlaceholder', { defaultValue: 'Was wurde heute durchgenommen?' })}
      className="border-input bg-card text-foreground h-9 min-w-0 flex-1 rounded-md border px-3 text-sm shadow-xs"
    />
  )
}

export type ErfassenTabProps = {
  teachingDays: TeachingDay[]
  students: Student[]
  entries: Record<string, NotenEntryRow>
  summary: Record<number, StudentSummary>
  lehrstoffByDay: Record<string, string>
  weights: WeightConfig
  weightsValid: boolean
  dayIndex: number
  hideGrades: boolean
  saving: boolean
  todayYmd: string
  semesterChangeDate: string | undefined
  onSelectDay: (index: number) => void
  onToggleHide: () => void
  onEntryChange: (entry: NotenEntryRow, patch: Partial<NotenEntryRow>) => void
  onSetAllAnwesend: (date: string, period: string) => void
  onCopyAttendance: (from: TeachingDay, to: TeachingDay) => void
  onSitzplatzChange: (studentId: number, value: string | null) => void
  onCommitLehrstoff: (date: string, period: string, value: string) => void
  onWeightChange: (key: keyof WeightConfig, value: number) => void
  onWeightCommit: () => void
}

export function ErfassenTab(props: ErfassenTabProps) {
  const { t } = useTranslation('common')
  const {
    teachingDays,
    students,
    entries,
    summary,
    lehrstoffByDay,
    weights,
    weightsValid,
    dayIndex,
    hideGrades,
    saving,
    todayYmd,
    semesterChangeDate,
    onSelectDay,
    onToggleHide,
    onEntryChange,
    onSetAllAnwesend,
    onCopyAttendance,
    onSitzplatzChange,
    onCommitLehrstoff,
    onWeightChange,
    onWeightCommit,
  } = props

  const [active, setActive] = useState<ActiveCell | null>(null)
  const [slot2, setSlot2] = useState<Set<number>>(new Set())
  const [noteOpen, setNoteOpen] = useState<number | null>(null)

  const day = teachingDays[dayIndex]

  // Changing the day drops the transient pad focus along with it.
  const selectDay = useCallback(
    (index: number) => {
      setActive(null)
      onSelectDay(index)
    },
    [onSelectDay],
  )

  const dayStats = useCallback(
    (index: number) => {
      const d = teachingDays[index]
      if (!d) return { done: 0, total: students.length }
      let done = 0
      for (const s of students) if (entries[entryKey(s.id, d.date, d.period)]?.attendance) done++
      return { done, total: students.length }
    },
    [teachingDays, students, entries],
  )

  const setMark = useCallback(
    (studentId: number, category: CategoryKey, slot: 1 | 2, value: number | null) => {
      const d = teachingDays[dayIndex]
      if (!d) return
      const entry = entries[entryKey(studentId, d.date, d.period)] ?? emptyEntry(studentId, d.date, d.period)
      onEntryChange(entry, { [categoryField(category, slot)]: value })
    },
    [teachingDays, dayIndex, entries, onEntryChange],
  )

  const setAttendance = useCallback(
    (studentId: number, value: string) => {
      const d = teachingDays[dayIndex]
      if (!d) return
      const entry = entries[entryKey(studentId, d.date, d.period)] ?? emptyEntry(studentId, d.date, d.period)
      onEntryChange(entry, { attendance: entry.attendance === value ? null : value })
    },
    [teachingDays, dayIndex, entries, onEntryChange],
  )

  // Keyboard entry for the focused cell. The listener re-subscribes when the
  // active cell or entries change so it always reads the current value; the
  // group is small enough that this costs nothing.
  useEffect(() => {
    if (!active || !day) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActive(null)
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        setMark(active.studentId, active.category, active.slot, null)
        return
      }
      if (e.key >= '1' && e.key <= '5') {
        e.preventDefault()
        const n = Number(e.key)
        const entry = entries[entryKey(active.studentId, day.date, day.period)]
        const current = entry
          ? (entry[categoryField(active.category, active.slot)] as number | null)
          : null
        setMark(active.studentId, active.category, active.slot, current === n ? Math.min(5, n + 0.5) : n)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, day, entries, setMark])

  if (!day) {
    return (
      <p className="text-muted-foreground text-sm">
        {t('noten.noDaySelected', { defaultValue: 'Kein Unterrichtstag ausgewählt.' })}
      </p>
    )
  }

  const stats = dayStats(dayIndex)
  const isToday = day.date === todayYmd
  const periodLong =
    day.period === 'AM'
      ? t('noten.vormittag', { defaultValue: 'Vormittag' })
      : t('noten.nachmittag', { defaultValue: 'Nachmittag' })
  const semesterLabel = isSemester2(day.date, semesterChangeDate)
    ? t('noten.semester2', { defaultValue: '2. Sem.' })
    : t('noten.semester1', { defaultValue: '1. Sem.' })

  const siblingIndex = teachingDays.findIndex((d, i) => i !== dayIndex && d.date === day.date)
  const sibling = siblingIndex > -1 ? teachingDays[siblingIndex] : null
  const siblingPeriodLong = sibling
    ? sibling.period === 'AM'
      ? t('noten.vormittag', { defaultValue: 'Vormittag' })
      : t('noten.nachmittag', { defaultValue: 'Nachmittag' })
    : ''

  const progressTone =
    stats.done === stats.total ? 'bg-success' : stats.done === 0 ? 'bg-muted-foreground' : 'bg-warning'

  return (
    <div className="flex flex-col gap-4">
      <DayPickerStrip
        teachingDays={teachingDays}
        dayIndex={dayIndex}
        todayYmd={todayYmd}
        dayStats={dayStats}
        onSelect={selectDay}
        onPrev={() => selectDay(Math.max(0, dayIndex - 1))}
        onNext={() => selectDay(Math.min(teachingDays.length - 1, dayIndex + 1))}
      />

      <div className="border-border bg-card rounded-lg border shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold tracking-tight">{longDate(day.date)}</h3>
              <Badge variant="info" className="gap-1">
                {day.period === 'AM' ? <Sun className="h-3 w-3" /> : <Sunset className="h-3 w-3" />}
                {periodLong}
              </Badge>
              {isToday && (
                <Badge variant="soft-muted">{t('noten.heute', { defaultValue: 'heute' })}</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-sm tabular-nums">
              {t('noten.daySubtitle', {
                tag: dayIndex + 1,
                total: teachingDays.length,
                semester: semesterLabel,
                defaultValue: `Tag ${dayIndex + 1} von ${teachingDays.length} · ${semesterLabel}`,
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="border-border/70 bg-muted/40 flex h-9 items-center gap-2 rounded-full border px-3 text-xs tabular-nums">
              <span className={cn('h-2 w-2 rounded-full', progressTone)} />
              {t('noten.progressRecorded', {
                done: stats.done,
                total: stats.total,
                defaultValue: `${stats.done} von ${stats.total} erfasst`,
              })}
            </span>

            <button
              type="button"
              onClick={() => onSetAllAnwesend(day.date, day.period)}
              disabled={saving}
              className="border-input bg-background text-foreground hover:bg-accent flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {t('noten.allPresent', { defaultValue: 'Alle anwesend' })}
            </button>

            {sibling && (
              <Hint
                label={t('noten.copyAttendanceHint', {
                  defaultValue:
                    'Übernimmt nur die Anwesenheit der anderen Tageshälfte. Noten bleiben unberührt.',
                })}
              >
                <button
                  type="button"
                  onClick={() => onCopyAttendance(sibling, day)}
                  className="border-input bg-background text-foreground hover:bg-accent flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition-colors"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  {t('noten.copyAttendance', {
                    period: siblingPeriodLong,
                    defaultValue: `Anwesenheit vom ${siblingPeriodLong} übernehmen`,
                  })}
                </button>
              </Hint>
            )}

            <WeightsPopover
              weights={weights}
              weightsValid={weightsValid}
              onChange={onWeightChange}
              onCommit={onWeightCommit}
            />

            <Hint
              label={t('noten.tooltipToggleGrades', {
                defaultValue:
                  'Blendet die Noten nur auf diesem Bildschirm aus — für die Besprechung vor der Klasse. Gespeichert bleibt alles.',
              })}
            >
              <button
                type="button"
                onClick={onToggleHide}
                className={cn(
                  'flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition-colors',
                  hideGrades
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-input bg-background text-foreground hover:bg-accent',
                )}
              >
                {hideGrades ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {hideGrades
                  ? t('noten.showAllGrades', { defaultValue: 'Noten einblenden' })
                  : t('noten.hideAllGrades', { defaultValue: 'Noten ausblenden' })}
              </button>
            </Hint>
          </div>
        </div>

        <div className="border-border/60 bg-muted/25 flex items-center gap-2.5 border-t border-b px-5 py-3">
          <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <BookOpen className="h-3.5 w-3.5" />
            {t('noten.lehrstoff')}
          </span>
          <LehrstoffInput
            key={`${day.date}-${day.period}`}
            initialValue={lehrstoffByDay[`${day.date}-${day.period}`] ?? ''}
            onCommit={value => onCommitLehrstoff(day.date, day.period, value)}
          />
        </div>

        <div
          className="grid gap-3 p-5"
          style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))' }}
        >
          {students.map(student => {
            const entry =
              entries[entryKey(student.id, day.date, day.period)] ??
              emptyEntry(student.id, day.date, day.period)
            const totals = summary[student.id]
            return (
              <StudentTile
                key={student.id}
                student={student}
                entry={entry}
                dayKey={`${day.date}-${day.period}`}
                hideGrades={hideGrades}
                active={active?.studentId === student.id ? active : null}
                slot2Open={slot2.has(student.id)}
                noteOpen={noteOpen === student.id}
                avg={totals?.calculatedGrade ?? null}
                absent={totals?.nichtAnwesend ?? 0}
                onSetAttendance={value => setAttendance(student.id, value)}
                onFocusCell={setActive}
                onSetMark={(category, slot, value) => setMark(student.id, category, slot, value)}
                onToggleSlot2={() =>
                  setSlot2(prev => {
                    const next = new Set(prev)
                    if (next.has(student.id)) next.delete(student.id)
                    else next.add(student.id)
                    return next
                  })
                }
                onToggleNote={() => setNoteOpen(prev => (prev === student.id ? null : student.id))}
                onCommitNote={value => onEntryChange(entry, { notizen: value })}
                onSitzplatzChange={value => onSitzplatzChange(student.id, value)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
