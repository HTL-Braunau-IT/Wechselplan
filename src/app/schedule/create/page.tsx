'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'next-i18next'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowRight, CalendarClock, Copy, Sunrise, Sunset, Trash2 } from 'lucide-react'

import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  amStartDate: string | null
  pmStartDate: string | null
  semesterPlanning: string | null
}

type Semester = 'full' | 'first' | 'second'

const DEFAULT_LANE: LaneCadence = { enabled: true, interval: 1, offset: 0, startDate: '' }

/** "yyyy-MM-dd" → "dd.MM." for the compact recap strip. */
const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return m && d ? `${d}.${m}.` : iso
}

/** A labelled row inside the plan card: a fixed label column and its control. */
function FieldRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b px-6 py-5 sm:flex-row sm:items-start sm:gap-6">
      <div className="w-40 shrink-0 sm:pt-1.5">
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-muted-foreground mt-1 text-xs">{hint}</div> : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/**
 * Step 1 of the wizard: class, weekday, periods and cadence.
 *
 * The day comes first because everything after it — groups included — belongs to
 * one weekday's plan: a class can be split differently on each day.
 */
export default function ClassDayPage() {
  const { t } = useTranslation('schedule')
  const router = useRouter()
  const searchParams = useSearchParams()
  const className = searchParams.get('class')
  const weekdayParam = searchParams.get('weekday')
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id

  const { data: classes = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['classes', schoolYearId],
    queryFn: async () => {
      const res = await fetch(`/api/classes?schoolYearId=${schoolYearId}`)
      if (!res.ok) throw new Error('Failed to fetch classes')
      return res.json() as Promise<{ id: number; name: string }[]>
    },
    enabled: schoolYearId != null,
    staleTime: 1000 * 60 * 5,
  })

  // No silent default: entering the step without a weekday used to preselect
  // Monday, so clicking "Weiter" on a class planned for another day saved a stray
  // Monday plan instead of editing the real one. The day is always picked here.
  const [weekday, setWeekday] = useState<number | null>(weekdayParam ? Number(weekdayParam) : null)
  const [am, setAm] = useState<LaneCadence>(DEFAULT_LANE)
  const [pm, setPm] = useState<LaneCadence>({ ...DEFAULT_LANE, enabled: false })
  const [semester, setSemester] = useState<Semester>('full')
  const [existing, setExisting] = useState<ScheduleShell[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weekdayName = useCallback((day: number) => t(`weekdays.${day}`), [t])

  // Prefill from the plan already stored for this weekday, and remember which
  // other weekdays have a plan (for the "copy from an existing day" action).
  const applyShell = useCallback((shell: ScheduleShell) => {
    setAm({
      enabled: shell.amEnabled,
      interval: shell.amWeekInterval,
      offset: shell.amWeekOffset,
      startDate: shell.amStartDate ? shell.amStartDate.slice(0, 10) : '',
    })
    setPm({
      enabled: shell.pmEnabled,
      interval: shell.pmWeekInterval,
      offset: shell.pmWeekOffset,
      startDate: shell.pmStartDate ? shell.pmStartDate.slice(0, 10) : '',
    })
    setSemester((shell.semesterPlanning as Semester | null) ?? 'full')
  }, [])

  useEffect(() => {
    if (!className) {
      setExisting([])
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
          const forWeekday =
            weekday != null ? shells.find(s => s.selectedWeekday === weekday) : undefined
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
  }, [className, selectedYear?.id])

  const plannedWeekdays = useMemo(() => new Set(existing.map(s => s.selectedWeekday)), [existing])
  const cloneSources = useMemo(
    () => (weekday == null ? [] : existing.filter(s => s.selectedWeekday !== weekday)),
    [existing, weekday],
  )
  const weekdayHasPlan = weekday != null && plannedWeekdays.has(weekday)

  // One-line recap of the current choices, shown in the card footer strip.
  const planSummary = useMemo(() => {
    const lanePart = (label: string, lane: LaneCadence) => {
      if (!lane.enabled) return `${label}: ${t('periodOff')}`
      const rhythm =
        lane.interval > 1
          ? lane.startDate
            ? `${t('everySecondWeek')}, ${t('fromDate', { date: shortDate(lane.startDate) })}`
            : t('everySecondWeek')
          : t('everyWeek')
      return `${label}: ${rhythm}`
    }
    const dayPart = weekday != null ? weekdayName(weekday) : t('pickWeekday')
    return `${dayPart} · ${lanePart(t('morning'), am)} · ${lanePart(t('afternoon'), pm)}`
  }, [weekday, am, pm, weekdayName, t])

  const handlePickClass = (name: string) => {
    // A different class starts with no day picked; its plans load via the URL.
    setWeekday(null)
    setAm(DEFAULT_LANE)
    setPm({ ...DEFAULT_LANE, enabled: false })
    setSemester('full')
    setError(null)
    router.replace(`/schedule/create?class=${encodeURIComponent(name)}`)
  }

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
    if (!className || weekday == null) return
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
      // The target day now mirrors the source (groups included); review from the groups step.
      router.push(`/schedule/create/groups?class=${className}&weekday=${weekday}`)
    } catch (err) {
      captureFrontendError(err, { location: 'schedule/create/periods', type: 'clone' })
      setError(t('cloneError'))
      setCloning(false)
    }
  }

  const handleDeleteDay = async () => {
    if (!className || weekday == null) return
    setDeleting(true)
    setError(null)
    try {
      const classId = await resolveClassId()
      const yearQ = selectedYear?.id != null ? `&schoolYearId=${selectedYear.id}` : ''
      const res = await fetch(`/api/schedules?classId=${classId}&weekday=${weekday}${yearQ}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('delete failed')
      setExisting(prev => prev.filter(s => s.selectedWeekday !== weekday))
      setWeekday(null)
      setAm(DEFAULT_LANE)
      setPm({ ...DEFAULT_LANE, enabled: false })
      setSemester('full')
      router.replace(`/schedule/create?class=${encodeURIComponent(className)}`)
    } catch (err) {
      captureFrontendError(err, { location: 'schedule/create/periods', type: 'delete' })
      setError(t('deleteDayError'))
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleNext = async () => {
    if (!className) return
    if (weekday == null) {
      setError(t('pickWeekday'))
      return
    }
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
          // A start date only applies to a biweekly lane; clear it otherwise so a
          // stale anchor never lingers after switching back to weekly.
          amStartDate:
            am.interval > 1 && am.startDate ? new Date(am.startDate).toISOString() : null,
          pmStartDate:
            pm.interval > 1 && pm.startDate ? new Date(pm.startDate).toISOString() : null,
          semesterPlanning: semester === 'full' ? null : semester,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      router.push(`/schedule/create/groups?class=${className}&weekday=${weekday}`)
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
          title={t('steps.class')}
          description={t('periodsDescription')}
        />

        <div className="border-border/60 bg-card/40 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border p-4">
          <Label htmlFor="class-select" className="text-muted-foreground">
            {t('class')}
          </Label>
          <Select value={className ?? ''} onValueChange={handlePickClass}>
            <SelectTrigger id="class-select" className="bg-background h-9 min-w-[180px]">
              <SelectValue placeholder={t('pleaseSelect')} />
            </SelectTrigger>
            <SelectContent>
              {classes.map(cls => (
                <SelectItem key={cls.id} value={cls.name}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!className ? (
          <div className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
            {t('selectClass')}
          </div>
        ) : loading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {/* The whole day-plan collapsed into one card: weekday, periods and
                semester as labelled rows, with a recap strip at the bottom. */}
            <Card className="overflow-hidden py-0">
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6 pb-4">
                <h3 className="text-lg font-semibold tracking-tight">
                  {t('planForClass', { class: className })}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {weekdayHasPlan && weekday != null && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={deleting || saving}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('deleteDay', { day: weekdayName(weekday) })}
                    </Button>
                  )}
                  {cloneSources.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={cloning}>
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
                                {t('cloneFromDayItem', {
                                  day: weekday != null ? weekdayName(weekday) : '',
                                })}
                              </span>
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              <FieldRow label={t('weekday')} hint={t('weekdayHint')}>
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
              </FieldRow>

              <FieldRow label={t('periods')} hint={t('periodsHint')}>
                <div className="space-y-3">
                  <PeriodLaneCard
                    title={t('morning')}
                    icon={Sunrise}
                    cadence={am}
                    onChange={setAm}
                  />
                  <PeriodLaneCard
                    title={t('afternoon')}
                    icon={Sunset}
                    cadence={pm}
                    onChange={setPm}
                  />
                </div>
              </FieldRow>

              <FieldRow label={t('semesterScope')}>
                <Tabs value={semester} onValueChange={v => setSemester(v as Semester)}>
                  <TabsList>
                    <TabsTrigger value="full">{t('wholeYear')}</TabsTrigger>
                    <TabsTrigger value="first">{t('firstSemester')}</TabsTrigger>
                    <TabsTrigger value="second">{t('secondSemester')}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </FieldRow>

              <div className="bg-muted/30 flex items-center gap-2 px-6 py-4">
                <span className="text-muted-foreground text-sm tabular-nums">{planSummary}</span>
              </div>
            </Card>

            <WizardFooter>
              <Button
                onClick={handleNext}
                disabled={saving || weekday == null || (!am.enabled && !pm.enabled)}
              >
                {saving ? <Spinner size="sm" /> : <ArrowRight className="h-4 w-4" />}
                {t('next')}
              </Button>
            </WizardFooter>
          </>
        )}

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('deleteDayTitle', { day: weekday != null ? weekdayName(weekday) : '' })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('deleteDayConfirm', {
                  day: weekday != null ? weekdayName(weekday) : '',
                  class: className,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={e => {
                  e.preventDefault()
                  void handleDeleteDay()
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Spinner size="sm" /> : <Trash2 className="h-4 w-4" />}
                {t('deleteDayAction')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </TooltipProvider>
  )
}
