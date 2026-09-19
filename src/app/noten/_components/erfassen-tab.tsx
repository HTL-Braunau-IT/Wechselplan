'use client'

import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpDown,
  Armchair,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  Info,
  LayoutGrid,
  Sun,
  Sunset,
} from 'lucide-react'
import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
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
import {
  emptyEntry,
  type NotenEntryRow,
  type SeatingLayout,
  type SeatPosition,
  type Student,
  type TeachingDay,
  type WeightConfig,
} from '../_lib/types'
import type { WeightLevel } from '@/lib/noten-weights'
import type { WeightLevels } from '../_hooks/use-noten-data'
import type { StudentSummary } from '../_lib/summary'

/** Fixed card width on the Sitzplan canvas (matches the grid's min column). */
const SEAT_CARD_W = 268
/** Gap used when auto-arranging students that have no saved position yet. */
const SEAT_GAP = 12
/** Rough card height, only for sizing the scrollable canvas — cards may vary. */
const SEAT_CARD_H_EST = 250

/**
 * One student card on the Sitzplan canvas: absolutely positioned at its saved
 * spot, moved only by the grip handle so taps on the card's own controls are
 * never read as drags. The live drag offset is applied via `transform`; the new
 * base position is committed on drag end (see `handleSeatDragEnd`).
 */
function DraggableSeat({
  id,
  pos,
  children,
}: {
  id: number
  pos: SeatPosition
  children: ReactNode
}) {
  const { t } = useTranslation('common')
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(id),
    data: { pos },
  })
  const style: CSSProperties = {
    position: 'absolute',
    left: pos.x,
    top: pos.y,
    width: SEAT_CARD_W,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 30 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('select-none', isDragging && 'opacity-95')}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label={t('noten.dragSeatHandle', { defaultValue: 'Karte verschieben' })}
        className="border-input bg-muted/60 text-muted-foreground hover:bg-accent mb-1 flex h-6 w-full touch-none cursor-grab items-center justify-center rounded-md border shadow-xs transition-colors active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      {children}
    </div>
  )
}

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
  seating: SeatingLayout
  entries: Record<string, NotenEntryRow>
  summary: Record<number, StudentSummary>
  lehrstoffByDay: Record<string, string>
  weightLevels: WeightLevels
  weights: WeightConfig
  weightsValid: boolean
  classLabel: string
  groupLabel: string
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
  onSeatChange: (studentId: number, position: SeatPosition) => void
  onCommitLehrstoff: (date: string, period: string, value: string) => void
  onWeightChange: (level: WeightLevel, key: keyof WeightConfig, value: number) => void
  onWeightEnableOverride: (level: WeightLevel) => void
  onWeightClearOverride: (level: WeightLevel) => void
  onWeightCommit: () => void
}

export function ErfassenTab(props: ErfassenTabProps) {
  const { t } = useTranslation('common')
  const {
    teachingDays,
    students,
    seating,
    entries,
    summary,
    lehrstoffByDay,
    weightLevels,
    weights,
    weightsValid,
    classLabel,
    groupLabel,
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
    onSeatChange,
    onCommitLehrstoff,
    onWeightChange,
    onWeightEnableOverride,
    onWeightClearOverride,
    onWeightCommit,
  } = props

  const [active, setActive] = useState<ActiveCell | null>(null)
  const [slot2, setSlot2] = useState<Set<number>>(new Set())
  const [noteOpen, setNoteOpen] = useState<number | null>(null)
  const [seatingMode, setSeatingMode] = useState(false)

  // Width of the Sitzplan canvas, so students without a saved position can be
  // auto-arranged into a grid that fills the available space.
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(0)
  useEffect(() => {
    if (!seatingMode) return
    const el = canvasRef.current
    if (!el) return
    setCanvasWidth(el.clientWidth)
    const ro = new ResizeObserver(entriesObs => {
      const w = entriesObs[0]?.contentRect.width
      if (w) setCanvasWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [seatingMode])

  // A small drag distance before a seat starts moving keeps taps on the card's
  // own buttons from being read as drags, on both mouse and touch.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  )

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

  const handleSeatDragEnd = useCallback(
    (event: DragEndEvent) => {
      const id = Number(event.active.id)
      if (!Number.isInteger(id)) return
      const base = (event.active.data.current as { pos?: SeatPosition } | undefined)?.pos
      if (!base) return
      onSeatChange(id, {
        x: Math.max(0, Math.round(base.x + event.delta.x)),
        y: Math.max(0, Math.round(base.y + event.delta.y)),
      })
    },
    [onSeatChange],
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

  // Auto-arrange students that have no saved seat into a grid that fills the
  // measured canvas width, so first entry into Sitzplan-Modus looks tidy.
  const perRow = Math.max(1, Math.floor((canvasWidth + SEAT_GAP) / (SEAT_CARD_W + SEAT_GAP)))
  const seatOf = (index: number, studentId: number): SeatPosition =>
    seating[studentId] ?? {
      x: (index % perRow) * (SEAT_CARD_W + SEAT_GAP),
      y: Math.floor(index / perRow) * (SEAT_CARD_H_EST + SEAT_GAP),
    }
  const canvasHeight =
    students.reduce((max, s, i) => Math.max(max, seatOf(i, s.id).y + SEAT_CARD_H_EST), 0) + SEAT_GAP

  const renderTile = (student: Student) => {
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
  }

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
              levels={weightLevels}
              effective={weights}
              weightsValid={weightsValid}
              classLabel={classLabel}
              groupLabel={groupLabel}
              onChange={onWeightChange}
              onEnableOverride={onWeightEnableOverride}
              onClearOverride={onWeightClearOverride}
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

            <Hint
              label={t('noten.tooltipSeatingMode', {
                defaultValue:
                  'Ordne die Schülerkarten frei an, wie sie im Klassenzimmer sitzen. Deine Anordnung wird pro Gruppe gespeichert.',
              })}
            >
              <button
                type="button"
                onClick={() => setSeatingMode(m => !m)}
                aria-pressed={seatingMode}
                className={cn(
                  'flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition-colors',
                  seatingMode
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-input bg-background text-foreground hover:bg-accent',
                )}
              >
                {seatingMode ? (
                  <LayoutGrid className="h-4 w-4" />
                ) : (
                  <Armchair className="h-4 w-4" />
                )}
                {seatingMode
                  ? t('noten.seatingModeExit', { defaultValue: 'Rasteransicht' })
                  : t('noten.seatingModeEnter', { defaultValue: 'Sitzplan' })}
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
          className={cn(
            'mx-5 mt-4 flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm',
            seatingMode
              ? 'border-primary/40 bg-primary/[.07] text-foreground'
              : 'border-border/70 bg-muted/40 text-muted-foreground',
          )}
        >
          {seatingMode ? (
            <Armchair className="text-primary mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>
            {seatingMode
              ? t('noten.seatingBanner', {
                  defaultValue:
                    'Sitzplan-Modus: Ziehe die Karten am Griff oben, um sie so anzuordnen, wie deine Klasse sitzt. Deine Anordnung wird automatisch gespeichert — nur für dich.',
                })
              : t('noten.seatingHint', {
                  defaultValue:
                    'Tipp: Mit „Sitzplan" oben kannst du die Schülerkarten frei anordnen, wie deine Klasse im Raum sitzt.',
                })}
          </span>
        </div>

        {seatingMode ? (
          <div className="p-5">
            <DndContext sensors={sensors} onDragEnd={handleSeatDragEnd}>
              <div
                ref={canvasRef}
                className="relative w-full overflow-x-auto"
                style={{ height: canvasHeight, minHeight: 320 }}
              >
                {students.map((student, index) => (
                  <DraggableSeat key={student.id} id={student.id} pos={seatOf(index, student.id)}>
                    {renderTile(student)}
                  </DraggableSeat>
                ))}
              </div>
            </DndContext>
          </div>
        ) : (
          <div
            className="grid gap-3 p-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(268px,1fr))' }}
          >
            {students.map(renderTile)}
          </div>
        )}
      </div>
    </div>
  )
}
