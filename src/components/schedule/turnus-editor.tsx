'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'next-i18next'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarRange,
  Minus,
  Palmtree,
  Plus,
  Repeat,
  RotateCcw,
  Sunrise,
  Sunset,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { eachMonthOfInterval, endOfMonth } from 'date-fns'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { WizardFooter } from '@/components/schedule/wizard-footer'
import { cn } from '@/lib/utils'
import { computePeriodTurns, isBiweekly, type PeriodCadence } from '@/lib/schedule-cadence'
import { captureFrontendError } from '@/lib/frontend-error'
import type { Holiday, ScheduleTerm } from '@/types/schedule'

interface Shell {
  amEnabled: boolean
  pmEnabled: boolean
  amWeekInterval: number
  amWeekOffset: number
  pmWeekInterval: number
  pmWeekOffset: number
  semesterPlanning: string | null
  amScheduleData?: Record<string, ScheduleTerm> | null
  pmScheduleData?: Record<string, ScheduleTerm> | null
}

interface LaneState {
  numberOfTerms: number
  customLengths: Record<string, number>
}

interface TurnusEditorProps {
  className: string
  weekday: number
  schoolYearId?: number
  schoolYearStart: Date | null
  schoolYearEnd: Date | null
  schoolYearMiddle: Date | null
}

const MAX_TERMS = 8

/** Austrian short month names, indexed by `Date.getMonth()`. */
const SHORT_MONTHS = [
  'Jän',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
]

const termName = (index: number) => `TURNUS ${index + 1}`
const kwNumber = (label: string) => label.replace(/^KW/i, '')

/**
 * The "Turnus" step. AM and PM are independent lanes: each has its own number of
 * Turnusse and its own cadence, so the weeks are computed per lane via
 * {@link computePeriodTurns} (which honours the biweekly A/B rhythm). Reads the
 * lane config from the schedule shell saved on the "Tag & Perioden" step.
 *
 * The interface is a "Jahresband" (year band): every lane's Turnusse are drawn
 * as proportional segments over a shared month/holiday axis, and the boundary
 * between two adjacent Turnusse can be dragged (or nudged with the arrow keys)
 * to move whole teaching weeks from one to the other. A boundary drag fixes both
 * neighbours' lengths in `customLengths` while preserving their sum, so no other
 * Turnus shifts — and the saved blob is exactly what the old number-input editor
 * produced.
 */
export function TurnusEditor({
  className,
  weekday,
  schoolYearId,
  schoolYearStart,
  schoolYearEnd,
  schoolYearMiddle,
}: TurnusEditorProps) {
  const { t } = useTranslation('schedule')
  const router = useRouter()

  const [shell, setShell] = useState<Shell | null>(null)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [am, setAm] = useState<LaneState>({ numberOfTerms: 4, customLengths: {} })
  const [pm, setPm] = useState<LaneState>({ numberOfTerms: 4, customLengths: {} })
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
        const [shellRes, holRes] = await Promise.all([
          fetch(
            `/api/schedules?classId=${encodeURIComponent(className)}&weekday=${weekday}${yearQ}`,
            { cache: 'no-store' },
          ),
          fetch('/api/settings/holidays'),
        ])
        if (!active) return
        if (shellRes.ok) {
          const shells = (await shellRes.json()) as (Shell & { additionalInfo?: string })[]
          if (!active) return
          const s = shells[0]
          if (s) {
            setShell(s)
            setAdditionalInfo(s.additionalInfo ?? '')
            // Restore both the Turnus count AND any per-Turnus custom lengths, so
            // revisiting the step and clicking Next doesn't silently drop them.
            const toLane = (data?: Record<string, ScheduleTerm> | null): LaneState | null => {
              if (!data) return null
              const names = Object.keys(data)
              if (names.length === 0) return null
              const customLengths: Record<string, number> = {}
              for (const name of names) {
                const length = data[name]?.customLength
                if (length && length > 0) customLengths[name] = length
              }
              return { numberOfTerms: names.length, customLengths }
            }
            const amLane = toLane(s.amScheduleData)
            const pmLane = toLane(s.pmScheduleData)
            if (amLane) setAm(amLane)
            if (pmLane) setPm(pmLane)
          }
        }
        if (holRes.ok) {
          const data = (await holRes.json()) as Holiday[]
          if (!active) return
          setHolidays(data)
        }
      } catch (err) {
        captureFrontendError(err, { location: 'schedule/create/rotation', type: 'load' })
        if (active) setError(t('failedToLoadHolidays'))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [className, weekday, schoolYearId, t])

  // Date window, narrowed by the semester scope chosen on the periods step.
  const { windowStart, windowEnd } = useMemo(() => {
    const start = shell?.semesterPlanning === 'second' ? schoolYearMiddle : schoolYearStart
    const end = shell?.semesterPlanning === 'first' ? schoolYearMiddle : schoolYearEnd
    return { windowStart: start, windowEnd: end }
  }, [shell?.semesterPlanning, schoolYearStart, schoolYearEnd, schoolYearMiddle])

  const buildTerms = useCallback(
    (lane: LaneState, cadence: PeriodCadence): ScheduleTerm[] => {
      if (!windowStart || !windowEnd) return []
      return computePeriodTurns({
        start: windowStart,
        end: windowEnd,
        weekday,
        numberOfTerms: lane.numberOfTerms,
        customLengths: lane.customLengths,
        holidays,
        cadence,
      })
    },
    [windowStart, windowEnd, weekday, holidays],
  )

  const amCadence: PeriodCadence = {
    weekInterval: shell?.amWeekInterval ?? 1,
    weekOffset: shell?.amWeekOffset ?? 0,
  }
  const pmCadence: PeriodCadence = {
    weekInterval: shell?.pmWeekInterval ?? 1,
    weekOffset: shell?.pmWeekOffset ?? 0,
  }

  const amTerms = useMemo(
    () => (shell?.amEnabled ? buildTerms(am, amCadence) : []),
    [shell?.amEnabled, am, buildTerms, shell?.amWeekInterval, shell?.amWeekOffset],
  )
  const pmTerms = useMemo(
    () => (shell?.pmEnabled ? buildTerms(pm, pmCadence) : []),
    [shell?.pmEnabled, pm, buildTerms, shell?.pmWeekInterval, shell?.pmWeekOffset],
  )

  // Shared month ruler + holiday strip, positioned by date fraction across the
  // (possibly semester-narrowed) plan window.
  const axis = useMemo(() => {
    if (!windowStart || !windowEnd) return null
    const startMs = windowStart.getTime()
    const endMs = windowEnd.getTime()
    const total = Math.max(1, endMs - startMs)
    const months = eachMonthOfInterval({ start: windowStart, end: windowEnd }).map(month => {
      const from = Math.max(month.getTime(), startMs)
      const to = Math.min(endOfMonth(month).getTime(), endMs)
      return { label: SHORT_MONTHS[month.getMonth()] ?? '', weight: Math.max(0, to - from) }
    })
    const ferien = holidays
      .map(holiday => {
        const hs = new Date(holiday.startDate).getTime()
        const he = new Date(holiday.endDate).getTime()
        const from = Math.max(hs, startMs)
        const to = Math.min(he, endMs)
        if (to <= from) return null
        return {
          name: holiday.name,
          left: ((from - startMs) / total) * 100,
          width: ((to - from) / total) * 100,
        }
      })
      .filter((span): span is { name: string; left: number; width: number } => span !== null)
    return { months, ferien }
  }, [windowStart, windowEnd, holidays])

  // Reference lane for the header summary (KW span, week + holiday counts).
  const summary = useMemo(() => {
    const terms = shell?.amEnabled ? amTerms : pmTerms
    const weeks = terms.flatMap(term => term.allWeeks ?? term.weeks)
    if (weeks.length === 0) return null
    const holidayWeeks = weeks.filter(week => week.isHoliday).length
    return {
      startKw: weeks[0]?.week ?? '',
      endKw: weeks[weeks.length - 1]?.week ?? '',
      count: weeks.length,
      holidays: holidayWeeks,
    }
  }, [shell?.amEnabled, amTerms, pmTerms])

  // `allWeeks` is a display-only expansion (teaching + holiday weeks); it never
  // gets persisted, so drop it from the saved blob.
  const toRecord = (terms: ScheduleTerm[]): Record<string, ScheduleTerm> =>
    Object.fromEntries(terms.map(({ allWeeks: _allWeeks, ...term }) => [term.name, term]))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/classes/get-by-name?name=${encodeURIComponent(className)}`)
      if (!res.ok) throw new Error('class lookup failed')
      const { id: classId } = (await res.json()) as { id: number }

      const saveRes = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Wechselplan ${className}`,
          description: `Wechselplan für Klasse ${className}`,
          startDate: (windowStart ?? new Date()).toISOString(),
          endDate: (windowEnd ?? new Date()).toISOString(),
          selectedWeekday: weekday,
          classId: String(classId),
          ...(schoolYearId != null ? { schoolYearId } : {}),
          amEnabled: shell?.amEnabled ?? false,
          pmEnabled: shell?.pmEnabled ?? false,
          amWeekInterval: amCadence.weekInterval,
          amWeekOffset: amCadence.weekOffset,
          pmWeekInterval: pmCadence.weekInterval,
          pmWeekOffset: pmCadence.weekOffset,
          amScheduleData: shell?.amEnabled ? toRecord(amTerms) : null,
          pmScheduleData: shell?.pmEnabled ? toRecord(pmTerms) : null,
          additionalInfo,
          semesterPlanning: shell?.semesterPlanning ?? null,
        }),
      })
      if (!saveRes.ok) throw new Error('save failed')
      router.push(`/schedule/create/times?class=${className}&weekday=${weekday}`)
    } catch (err) {
      captureFrontendError(err, { location: 'schedule/create/rotation', type: 'save' })
      setError(t('failedToSaveSchedule'))
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="border-border/60 bg-card/40 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border p-4">
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <CalendarClock className="h-3.5 w-3.5" />
          {t('rotationDay')}
        </span>
        <span className="font-semibold">{t(`weekdays.${weekday}`)}</span>
        {shell?.semesterPlanning && (
          <Badge variant="secondary">
            {shell.semesterPlanning === 'first' ? t('firstSemester') : t('secondSemester')}
          </Badge>
        )}
        {summary && (
          <>
            <span className="bg-border h-5 w-px" />
            <span className="text-muted-foreground text-sm tabular-nums">
              {t('bandSummary', {
                startKw: summary.startKw,
                endKw: kwNumber(summary.endKw),
                count: summary.count,
                holidays: summary.holidays,
              })}
            </span>
          </>
        )}
      </div>

      <Card>
        <CardHeader className="gap-1">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-muted text-muted-foreground rounded-lg p-2">
                <CalendarRange className="h-5 w-5" />
              </span>
              <h3 className="text-lg font-semibold tracking-tight">{t('yearBand')}</h3>
            </div>
            <span className="text-muted-foreground text-sm">{t('yearBandHint')}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {axis && (
            <>
              <div className="flex items-end gap-4">
                <div className="w-[180px] shrink-0" />
                <div className="flex min-w-0 flex-1 gap-0.5">
                  {axis.months.map((month, index) => (
                    <div
                      key={index}
                      className="min-w-0 overflow-hidden"
                      style={{ flexGrow: month.weight, flexBasis: 0 }}
                    >
                      <div className="text-muted-foreground truncate pl-1 text-xs font-medium tracking-wide uppercase">
                        {month.label}
                      </div>
                      <div className="border-border h-1.5 border-l" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="text-muted-foreground flex w-[180px] shrink-0 items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                  <Palmtree className="h-3.5 w-3.5" />
                  {t('ferien')}
                </div>
                <div className="relative h-11 min-w-0 flex-1">
                  {axis.ferien.map((span, index) => (
                    <div
                      key={index}
                      className="absolute top-0"
                      style={{ left: `${span.left}%`, width: `${span.width}%` }}
                    >
                      <div className="bg-muted h-4 rounded-sm" />
                      <div
                        className="text-muted-foreground truncate pt-0.5 text-[10px]"
                        title={span.name}
                      >
                        {span.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator className="my-2" />
            </>
          )}

          {shell?.amEnabled && (
            <LaneBand
              title={t('morningAssignments')}
              icon={Sunrise}
              biweekly={isBiweekly(amCadence)}
              lane={am}
              terms={amTerms}
              onChange={setAm}
            />
          )}
          {shell?.pmEnabled && (
            <LaneBand
              title={t('afternoonAssignments')}
              icon={Sunset}
              biweekly={isBiweekly(pmCadence)}
              lane={pm}
              terms={pmTerms}
              onChange={setPm}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-2">
          <Label htmlFor="additional-info" className="text-sm font-medium">
            {t('additionalInformation')}
          </Label>
        </CardHeader>
        <CardContent>
          <Input
            id="additional-info"
            value={additionalInfo}
            onChange={e => setAdditionalInfo(e.target.value)}
            placeholder={t('additionalInfoPlaceholder')}
          />
        </CardContent>
      </Card>

      <WizardFooter
        back={
          <Button variant="outline" onClick={() => router.back()} disabled={saving}>
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </Button>
        }
      >
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size="sm" /> : <ArrowRight className="h-4 w-4" />}
          {saving ? t('saving') : t('next')}
        </Button>
      </WizardFooter>
    </div>
  )
}

interface LaneBandProps {
  title: string
  icon: LucideIcon
  biweekly: boolean
  lane: LaneState
  terms: ScheduleTerm[]
  onChange: (next: LaneState) => void
}

interface DragState {
  boundary: number
  baseA: number
  baseB: number
  startX: number
  cellWidth: number
  lastSteps: number
}

/**
 * One period's row in the year band: a proportional strip of Turnus segments with
 * draggable boundaries between them, plus a Turnusse stepper and a per-Turnus
 * manual week-length control.
 */
function LaneBand({ title, icon: Icon, biweekly, lane, terms, onChange }: LaneBandProps) {
  const { t } = useTranslation('schedule')
  const bandRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  const totalWeeks = terms.reduce((sum, term) => sum + term.weeks.length, 0)

  const setTerms = (next: number) => {
    const clamped = Math.max(1, Math.min(MAX_TERMS, next))
    // Drop custom lengths for Turnusse that no longer exist so a later increase
    // doesn't resurrect a stale override.
    const customLengths: Record<string, number> = {}
    for (const [key, value] of Object.entries(lane.customLengths)) {
      const match = /^TURNUS (\d+)$/.exec(key)
      if (match && Number(match[1]) <= clamped) customLengths[key] = value
    }
    onChange({ numberOfTerms: clamped, customLengths })
  }

  // Fix both sides of a boundary so weeks move between exactly those two Turnusse
  // and their sum — hence every other Turnus — stays put.
  const applyBoundary = (index: number, aLength: number, bLength: number) => {
    const customLengths = { ...lane.customLengths }
    customLengths[termName(index)] = aLength
    customLengths[termName(index + 1)] = bLength
    onChange({ ...lane, customLengths })
  }

  const nudge = (index: number, direction: 1 | -1) => {
    const a = terms[index]?.weeks.length ?? 0
    const b = terms[index + 1]?.weeks.length ?? 0
    const aLength = a + direction
    const bLength = b - direction
    if (aLength < 1 || bLength < 1) return
    applyBoundary(index, aLength, bLength)
  }

  const beginDrag = (event: ReactPointerEvent, index: number) => {
    const width = bandRef.current?.getBoundingClientRect().width ?? 0
    const totalCells = terms.reduce(
      (sum, term) => sum + Math.max(1, (term.allWeeks ?? term.weeks).length),
      0,
    )
    const cellWidth = totalCells > 0 && width > 0 ? width / totalCells : 28
    dragRef.current = {
      boundary: index,
      baseA: terms[index]?.weeks.length ?? 0,
      baseB: terms[index + 1]?.weeks.length ?? 0,
      startX: event.clientX,
      cellWidth,
      lastSteps: 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveDrag = (event: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const raw = Math.round(dx / drag.cellWidth)
    const steps = Math.max(1 - drag.baseA, Math.min(drag.baseB - 1, raw))
    if (steps === drag.lastSteps) return
    drag.lastSteps = steps
    applyBoundary(drag.boundary, drag.baseA + steps, drag.baseB - steps)
  }

  const endDrag = (event: ReactPointerEvent) => {
    if (dragRef.current) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // capture may already be gone; nothing to release.
      }
    }
    dragRef.current = null
  }

  return (
    <div className="flex items-start gap-4 py-3">
      <div className="flex w-[180px] shrink-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon className="text-muted-foreground h-4 w-4" />
          <span className="font-semibold tracking-tight">{title}</span>
          {biweekly && (
            <Badge variant="secondary" className="gap-1">
              <Repeat className="h-3 w-3" />
              {t('biweeklyBadge')}
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground text-xs tabular-nums">
          {t('laneSummary', { terms: lane.numberOfTerms, weeks: totalWeeks })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">{t('turnusPlural')}</span>
          <div className="border-input bg-background flex items-center overflow-hidden rounded-md border shadow-xs">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-none"
              aria-label={t('fewerTurnusse')}
              onClick={() => setTerms(lane.numberOfTerms - 1)}
              disabled={lane.numberOfTerms <= 1}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-7 text-center text-sm font-semibold tabular-nums">
              {lane.numberOfTerms}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-none"
              aria-label={t('moreTurnusse')}
              onClick={() => setTerms(lane.numberOfTerms + 1)}
              disabled={lane.numberOfTerms >= MAX_TERMS}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div ref={bandRef} className="flex min-w-0 flex-1 items-stretch">
        {terms.map((term, index) => {
          const cells = term.allWeeks ?? term.weeks
          const isManual = lane.customLengths[term.name] != null
          const firstKw = cells[0]?.week ?? ''
          const lastKw = cells[cells.length - 1]?.week ?? ''
          return (
            <Fragment key={term.name}>
              <div
                className="flex min-w-0 flex-col"
                style={{ flexGrow: Math.max(1, cells.length), flexBasis: 0 }}
              >
                <div className="mb-1 min-w-0 px-0.5">
                  <div className="text-sm font-semibold">T{index + 1}</div>
                  <div className="text-muted-foreground truncate text-xs tabular-nums">
                    {firstKw && lastKw ? `${firstKw} – ${kwNumber(lastKw)}` : '—'}
                  </div>
                </div>
                <div className="flex gap-px">
                  {cells.map((week, cellIndex) => (
                    <div
                      key={`${week.date}-${cellIndex}`}
                      title={week.isHoliday ? (week.holidayName ?? week.date) : week.date}
                      className={cn(
                        'flex h-6 min-w-0 flex-1 items-center justify-center rounded-sm text-[10px] tabular-nums',
                        week.isHoliday
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary/10 text-foreground',
                      )}
                    >
                      {kwNumber(week.week)}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 px-0.5">
                  <Input
                    type="number"
                    min={1}
                    aria-label={`${title} · ${t('weeks')} · T${index + 1}`}
                    value={isManual ? (lane.customLengths[term.name] ?? '') : ''}
                    placeholder={String(term.weeks.length)}
                    onChange={event => {
                      const value = event.target.value
                      const next = { ...lane.customLengths }
                      if (value === '' || Number(value) <= 0) delete next[term.name]
                      else next[term.name] = Number(value)
                      onChange({ ...lane, customLengths: next })
                    }}
                    className="h-7 w-14"
                  />
                  {isManual ? (
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...lane.customLengths }
                        delete next[term.name]
                        onChange({ ...lane, customLengths: next })
                      }}
                      className="border-border hover:bg-accent inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
                    >
                      {t('manual')}
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  ) : (
                    <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold">
                      {t('auto')}
                    </span>
                  )}
                </div>
              </div>

              {index < terms.length - 1 && (
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t('moveBoundary')}
                  tabIndex={0}
                  onPointerDown={event => beginDrag(event, index)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onKeyDown={event => {
                    if (event.key === 'ArrowRight') {
                      event.preventDefault()
                      nudge(index, 1)
                    } else if (event.key === 'ArrowLeft') {
                      event.preventDefault()
                      nudge(index, -1)
                    }
                  }}
                  className="group focus-visible:ring-ring relative flex w-2.5 shrink-0 cursor-col-resize touch-none items-stretch justify-center self-stretch rounded-sm outline-none focus-visible:ring-2"
                >
                  <span className="bg-border group-hover:bg-primary w-px" />
                  <span className="bg-foreground/25 group-hover:bg-primary absolute top-9 h-4 w-1.5 rounded-full" />
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
