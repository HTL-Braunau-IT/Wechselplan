'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'next-i18next'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Copy,
  Sunrise,
  Sunset,
} from 'lucide-react'

import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WizardFooter } from '@/components/schedule/wizard-footer'
import { PeriodLaneCard, type LaneCadence } from '@/components/schedule/period-lane-card'
import { useSchoolYear } from '@/contexts/school-year-context'
import { captureFrontendError } from '@/lib/frontend-error'
import { cn } from '@/lib/utils'

const CHIP_CLASS =
  'focus-visible:ring-ring flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none'
const CHIP_ACTIVE = 'border-primary bg-primary/10 text-foreground'
const CHIP_IDLE = 'border-border bg-background hover:bg-muted/60'
const WEEKDAYS = [1, 2, 3, 4, 5] as const

interface ScheduleShell {
  selectedWeekday: number
  amEnabled: boolean
  pmEnabled: boolean
  amWeekInterval: number
  amWeekOffset: number
  pmWeekInterval: number
  pmWeekOffset: number
  semesterPlanning: string | null
}

type Semester = 'full' | 'first' | 'second'

const DEFAULT_LANE: LaneCadence = { enabled: true, interval: 1, offset: 0 }

export default function PeriodsPage() {
  const { t } = useTranslation('schedule')
  const router = useRouter()
  const searchParams = useSearchParams()
  const className = searchParams.get('class')
  const weekdayParam = searchParams.get('weekday')
  const { selectedYear } = useSchoolYear()

  const [weekday, setWeekday] = useState<number>(weekdayParam ? Number(weekdayParam) : 1)
  const [am, setAm] = useState<LaneCadence>(DEFAULT_LANE)
  const [pm, setPm] = useState<LaneCadence>({ ...DEFAULT_LANE, enabled: false })
  const [semester, setSemester] = useState<Semester>('full')
  const [existing, setExisting] = useState<ScheduleShell[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekdayName = useCallback((day: number) => t(`weekdays.${day}`), [t])

  // Prefill from the plan already stored for this weekday, and remember which
  // other weekdays have a plan (for the "copy from an existing day" action).
  const applyShell = useCallback((shell: ScheduleShell) => {
    setAm({
      enabled: shell.amEnabled,
      interval: shell.amWeekInterval,
      offset: shell.amWeekOffset,
    })
    setPm({
      enabled: shell.pmEnabled,
      interval: shell.pmWeekInterval,
      offset: shell.pmWeekOffset,
    })
    setSemester((shell.semesterPlanning as Semester | null) ?? 'full')
  }, [])

  useEffect(() => {
    if (!className) {
      setError(t('noClassSelected'))
      setLoading(false)
      return
    }
    let active = true
    const load = async () => {
      try {
        setLoading(true)
        const yearQ = selectedYear?.id != null ? `&schoolYearId=${selectedYear.id}` : ''
        const res = await fetch(`/api/schedules?classId=${encodeURIComponent(className)}${yearQ}`, {
          cache: 'no-store',
        })
        if (!active) return
        if (res.ok) {
          const shells = (await res.json()) as ScheduleShell[]
          setExisting(shells)
          const forWeekday = shells.find(s => s.selectedWeekday === weekday)
          if (forWeekday) applyShell(forWeekday)
        } else {
          setExisting([])
        }
      } catch (err) {
        captureFrontendError(err, { location: 'schedule/create/periods', type: 'load' })
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
    // Reload when the class or year changes; weekday prefill is handled on click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, selectedYear?.id])

  const plannedWeekdays = useMemo(() => new Set(existing.map(s => s.selectedWeekday)), [existing])
  const cloneSources = useMemo(
    () => existing.filter(s => s.selectedWeekday !== weekday),
    [existing, weekday],
  )

  const handlePickWeekday = (day: number) => {
    setWeekday(day)
    const shell = existing.find(s => s.selectedWeekday === day)
    if (shell) {
      applyShell(shell)
    } else {
      // A day with no plan yet starts fresh rather than inheriting the last day's
      // cadence/semester.
      setAm(DEFAULT_LANE)
      setPm({ ...DEFAULT_LANE, enabled: false })
      setSemester('full')
    }
  }

  const resolveClassId = async (): Promise<number> => {
    const res = await fetch(`/api/classes/get-by-name?name=${encodeURIComponent(className ?? '')}`)
    if (!res.ok) throw new Error('Failed to resolve class')
    const data = (await res.json()) as { id: number }
    return data.id
  }

  const handleClone = async (fromWeekday: number) => {
    if (!className) return
    setCloning(true)
    setError(null)
    try {
      const classId = await resolveClassId()
      const res = await fetch('/api/schedules/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          fromWeekday,
          toWeekday: weekday,
          schoolYearId: selectedYear?.id,
          overwrite: true,
        }),
      })
      if (!res.ok) throw new Error('clone failed')
      // The target day now mirrors the source; drop into the teacher step to adjust.
      router.push(`/schedule/create/teachers?class=${className}&weekday=${weekday}`)
    } catch (err) {
      captureFrontendError(err, { location: 'schedule/create/periods', type: 'clone' })
      setError(t('cloneError'))
      setCloning(false)
    }
  }

  const handleNext = async () => {
    if (!className) return
    if (!am.enabled && !pm.enabled) {
      setError(t('atLeastOnePeriod'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const classId = await resolveClassId()
      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Wechselplan ${className}`,
          description: `Wechselplan für Klasse ${className}`,
          startDate: (selectedYear ? new Date(selectedYear.startDate) : new Date()).toISOString(),
          endDate: (selectedYear ? new Date(selectedYear.endDate) : new Date()).toISOString(),
          selectedWeekday: weekday,
          classId: String(classId),
          ...(selectedYear?.id != null ? { schoolYearId: selectedYear.id } : {}),
          amEnabled: am.enabled,
          pmEnabled: pm.enabled,
          amWeekInterval: am.interval,
          amWeekOffset: am.offset,
          pmWeekInterval: pm.interval,
          pmWeekOffset: pm.offset,
          semesterPlanning: semester === 'full' ? null : semester,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      router.push(`/schedule/create/teachers?class=${className}&weekday=${weekday}`)
    } catch (err) {
      captureFrontendError(err, { location: 'schedule/create/periods', type: 'save' })
      setError(t('saveFailed'))
      setSaving(false)
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <PageContainer size="wide" className="space-y-6">
        <PageHeader
          icon={CalendarClock}
          title={t('periodsTitle')}
          description={t('periodsDescription')}
        />

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {/* Weekday picker */}
            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="text-muted-foreground h-5 w-5" />
                    <h2 className="text-xl font-semibold tracking-tight">{t('weekday')}</h2>
                  </div>
                  {cloneSources.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" disabled={cloning}>
                          {cloning ? <Spinner size="sm" /> : <Copy className="h-4 w-4" />}
                          {t('cloneFromDay')}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        {cloneSources.map(s => (
                          <DropdownMenuItem
                            key={s.selectedWeekday}
                            onSelect={() => handleClone(s.selectedWeekday)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            <span className="flex flex-col">
                              <span>{weekdayName(s.selectedWeekday)}</span>
                              <span className="text-muted-foreground text-xs">
                                {t('cloneFromDayItem', { day: weekdayName(weekday) })}
                              </span>
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(day => {
                    const active = day === weekday
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-current={active ? 'true' : undefined}
                        onClick={() => handlePickWeekday(day)}
                        className={cn(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_IDLE)}
                      >
                        <span className="font-semibold">{weekdayName(day)}</span>
                        {plannedWeekdays.has(day) && (
                          <span
                            role="img"
                            aria-label={t('dayHasPlan')}
                            className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="text-muted-foreground text-xs">{t('weekdayHint')}</p>
              </CardContent>
            </Card>

            {/* Period lanes */}
            <div className="grid gap-4 md:grid-cols-2">
              <PeriodLaneCard title={t('morning')} icon={Sunrise} cadence={am} onChange={setAm} />
              <PeriodLaneCard title={t('afternoon')} icon={Sunset} cadence={pm} onChange={setPm} />
            </div>

            {/* Semester scope */}
            <Card>
              <CardHeader className="gap-4">
                <h2 className="text-xl font-semibold tracking-tight">{t('semesterScope')}</h2>
              </CardHeader>
              <CardContent>
                <Tabs value={semester} onValueChange={v => setSemester(v as Semester)}>
                  <TabsList>
                    <TabsTrigger value="full">{t('wholeYear')}</TabsTrigger>
                    <TabsTrigger value="first">{t('firstSemester')}</TabsTrigger>
                    <TabsTrigger value="second">{t('secondSemester')}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardContent>
            </Card>

            <WizardFooter
              back={
                <Button
                  variant="outline"
                  onClick={() => router.push(`/schedule/create?class=${className ?? ''}`)}
                  disabled={saving}
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t('back')}
                </Button>
              }
            >
              <Button onClick={handleNext} disabled={saving || (!am.enabled && !pm.enabled)}>
                {saving ? <Spinner size="sm" /> : <ArrowRight className="h-4 w-4" />}
                {t('next')}
              </Button>
            </WizardFooter>
          </>
        )}
      </PageContainer>
    </TooltipProvider>
  )
}
