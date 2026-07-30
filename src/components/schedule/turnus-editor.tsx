'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'next-i18next'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Repeat,
  Sunrise,
  Sunset,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { WizardFooter } from '@/components/schedule/wizard-footer'
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

/**
 * The "Turnus" step. AM and PM are independent lanes: each has its own number of
 * Turnusse and its own cadence, so the weeks are computed per lane via
 * {@link computePeriodTurns} (which honours the biweekly A/B rhythm). Reads the
 * lane config from the schedule shell saved on the "Tag & Perioden" step.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shell?.amEnabled, am, buildTerms, shell?.amWeekInterval, shell?.amWeekOffset],
  )
  const pmTerms = useMemo(
    () => (shell?.pmEnabled ? buildTerms(pm, pmCadence) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shell?.pmEnabled, pm, buildTerms, shell?.pmWeekInterval, shell?.pmWeekOffset],
  )

  const toRecord = (terms: ScheduleTerm[]): Record<string, ScheduleTerm> =>
    Object.fromEntries(terms.map(term => [term.name, term]))

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
      </div>

      {shell?.amEnabled && (
        <LaneTurnusCard
          title={t('morningAssignments')}
          icon={Sunrise}
          biweekly={isBiweekly(amCadence)}
          lane={am}
          terms={amTerms}
          onChange={setAm}
        />
      )}
      {shell?.pmEnabled && (
        <LaneTurnusCard
          title={t('afternoonAssignments')}
          icon={Sunset}
          biweekly={isBiweekly(pmCadence)}
          lane={pm}
          terms={pmTerms}
          onChange={setPm}
        />
      )}

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

interface LaneTurnusCardProps {
  title: string
  icon: LucideIcon
  biweekly: boolean
  lane: LaneState
  terms: ScheduleTerm[]
  onChange: (next: LaneState) => void
}

function LaneTurnusCard({
  title,
  icon: Icon,
  biweekly,
  lane,
  terms,
  onChange,
}: LaneTurnusCardProps) {
  const { t } = useTranslation('schedule')
  const totalWeeks = terms.reduce((sum, term) => sum + term.weeks.length, 0)

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="bg-muted text-muted-foreground rounded-lg p-2">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
            {biweekly && (
              <Badge variant="secondary" className="gap-1">
                <Repeat className="h-3 w-3" />
                {t('biweeklyBadge')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`terms-${title}`} className="text-muted-foreground text-sm">
              {t('numberOfTerms')}
            </Label>
            <Input
              id={`terms-${title}`}
              type="number"
              min={1}
              max={MAX_TERMS}
              value={lane.numberOfTerms}
              onChange={e => {
                const n = Math.max(1, Math.min(MAX_TERMS, Number(e.target.value) || 1))
                onChange({ ...lane, numberOfTerms: n })
              }}
              className="h-9 w-20"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {terms.map(term => {
            const first = term.weeks[0]
            const last = term.weeks[term.weeks.length - 1]
            return (
              <div key={term.name} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{term.name}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {term.weeks.length} {t('weeks')}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {first && last ? `${first.date} – ${last.date}` : '—'}
                </p>
                <div className="mt-2">
                  <Label
                    htmlFor={`len-${title}-${term.name}`}
                    className="text-muted-foreground text-[11px]"
                  >
                    {t('customLengths')}
                  </Label>
                  <Input
                    id={`len-${title}-${term.name}`}
                    type="number"
                    min={0}
                    value={lane.customLengths[term.name] ?? ''}
                    placeholder="auto"
                    onChange={e => {
                      const value = e.target.value
                      const next = { ...lane.customLengths }
                      if (value === '' || Number(value) <= 0) delete next[term.name]
                      else next[term.name] = Number(value)
                      onChange({ ...lane, customLengths: next })
                    }}
                    className="mt-1 h-8"
                  />
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-muted-foreground text-sm tabular-nums">
          {t('totalWeeks', { count: totalWeeks })}
        </p>
      </CardContent>
    </Card>
  )
}
