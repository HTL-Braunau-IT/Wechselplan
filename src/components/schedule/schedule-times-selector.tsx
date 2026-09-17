'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Coffee,
  Plus,
  Sunrise,
  Sunset,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { WizardFooter } from '@/components/schedule/wizard-footer'
import { useClassDataByName } from '@/hooks/use-class-data'
import { useScheduleTimes } from '@/hooks/use-schedule-times'
import { useTeacherAssignments } from '@/hooks/use-teacher-assignments'
import { useSaveScheduleTimes } from '@/hooks/use-schedule-times'
import type { ScheduleTime, BreakTime } from '@/types/schedule'

interface ScheduleTimesSelectorProps {
  className: string | null
  /** The weekday being edited — scopes which lanes (AM/PM) are active. */
  weekday?: number | null
  onSave?: () => void
  onCancel?: () => void
}

/** "HH:mm" → minutes since midnight; NaN for anything unparseable. */
function toMinutes(hhmm: string | undefined): number {
  if (!hhmm) return NaN
  const [h, m] = hhmm.split(':').map(Number)
  if (h === undefined || Number.isNaN(h)) return NaN
  return h * 60 + (m === undefined || Number.isNaN(m) ? 0 : m)
}

/** House style for a time range: "HH:mm – HH:mm" with an en dash. */
function formatRange(start: string, end: string): string {
  return `${start} – ${end}`
}

/** "HH:mm" for a minute offset, used for the axis hour labels. */
function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface DayBlock {
  key: string
  label: string
  start: string
  end: string
  kind: 'lesson' | 'break'
}

/**
 * Component for managing schedule and break times for a selected class.
 *
 * Fetches teacher assignments to determine active periods, loads available schedule and break times,
 * and allows users to select or add new times for AM, PM, and lunch periods. The selected times are
 * mirrored live onto a horizontal day-axis so the shape of the day is visible while choosing.
 */
export function ScheduleTimesSelector({
  className,
  weekday,
  onSave,
  onCancel,
}: ScheduleTimesSelectorProps) {
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [breakTimes, setBreakTimes] = useState<BreakTime[]>([])
  const [selectedAMScheduleTime, setSelectedAMScheduleTime] = useState<number | null>(null)
  const [selectedPMScheduleTime, setSelectedPMScheduleTime] = useState<number | null>(null)
  const [selectedAMBreakTime, setSelectedAMBreakTime] = useState<number | null>(null)
  const [selectedLunchBreakTime, setSelectedLunchBreakTime] = useState<number | null>(null)
  const [selectedPMBreakTime, setSelectedPMBreakTime] = useState<number | null>(null)
  const [periods, setPeriods] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingSavedTimes, setIsLoadingSavedTimes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmittingScheduleTime, setIsSubmittingScheduleTime] = useState(false)
  const { t } = useTranslation(['common', 'schedule'])

  // New form states
  const [newScheduleTime, setNewScheduleTime] = useState<Partial<ScheduleTime>>({
    startTime: '',
    endTime: '',
    hours: 0,
    period: 'AM',
  })

  const [newBreakTime, setNewBreakTime] = useState<Partial<BreakTime>>({
    name: '',
    startTime: '',
    endTime: '',
    period: 'AM',
  })

  const [isScheduleTimeFormOpen, setIsScheduleTimeFormOpen] = useState(false)
  const [isBreakTimeFormOpen, setIsBreakTimeFormOpen] = useState(false)

  const [classId, setClassId] = useState<number | null>(null)

  // Resolve className to classId when className changes
  const { data: classData } = useClassDataByName(className ?? null)

  useEffect(() => {
    if (classData) {
      setClassId(classData.id)
    } else if (!className) {
      setClassId(null)
      setError('Class ID is required')
      setIsLoading(false)
    }
  }, [classData, className])

  // Fetch teacher assignments to determine periods (scoped to this weekday).
  const { data: teacherAssignmentsData } = useTeacherAssignments(classId, weekday ?? null)

  // Fetch schedule times (scoped to this weekday's plan)
  useScheduleTimes(classId, weekday ?? null)

  // Save mutation
  const saveTimesMutation = useSaveScheduleTimes()

  useEffect(() => {
    if (!className || !classId) {
      return
    }
    void fetchData()
  }, [className, classId, teacherAssignmentsData])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Get unique periods from assignments
      const newPeriods = new Set<string>()
      if ((teacherAssignmentsData?.amAssignments?.length ?? 0) > 0) newPeriods.add('AM')
      if ((teacherAssignmentsData?.pmAssignments?.length ?? 0) > 0) newPeriods.add('PM')
      setPeriods(newPeriods)

      // Fetch schedule times
      const scheduleResponse = await fetch('/api/admin/settings/schedule-times')
      if (!scheduleResponse.ok) throw new Error('Failed to fetch schedule times')
      const scheduleData = (await scheduleResponse.json()) as ScheduleTime[]

      // Filter schedule times based on periods in assignments
      const filteredScheduleTimes = scheduleData.filter(time => newPeriods.has(time.period))
      setScheduleTimes(filteredScheduleTimes)

      // Fetch break times
      const breakResponse = await fetch('/api/admin/settings/break-times')
      if (!breakResponse.ok) throw new Error('Failed to fetch break times')
      const breakData = (await breakResponse.json()) as BreakTime[]

      // Filter break times based on periods and lunch breaks
      const filteredBreakTimes = breakData.filter(time => {
        // Always show lunch breaks if there are any assignments
        if (time.period === 'LUNCH') {
          return newPeriods.size > 0 // Show lunch breaks if there are any AM or PM assignments
        }
        // For other breaks, filter by period
        return newPeriods.has(time.period)
      })

      setBreakTimes(filteredBreakTimes)

      // Fetch saved times for this class
      setIsLoadingSavedTimes(true)
      try {
        const weekdayQuery =
          weekday != null && !Number.isNaN(weekday) ? `&selectedWeekday=${weekday}` : ''
        const savedTimesResponse = await fetch(
          `/api/schedules/times?classId=${classId}${weekdayQuery}`,
        )
        if (savedTimesResponse.ok) {
          const savedTimes = await savedTimesResponse.json()

          // Set selected schedule times
          if (savedTimes.times?.scheduleTimes && Array.isArray(savedTimes.times.scheduleTimes)) {
            const amTime = savedTimes.times.scheduleTimes.find(
              (time: { id: number; period: string }) => time.period === 'AM',
            )
            const pmTime = savedTimes.times.scheduleTimes.find(
              (time: { id: number; period: string }) => time.period === 'PM',
            )
            if (amTime?.id) setSelectedAMScheduleTime(Number(amTime.id))
            if (pmTime?.id) setSelectedPMScheduleTime(Number(pmTime.id))
          }

          // Set selected break times
          if (savedTimes.times?.breakTimes && Array.isArray(savedTimes.times.breakTimes)) {
            const amBreak = savedTimes.times.breakTimes.find(
              (time: { id: number; period: string }) => time.period === 'AM',
            )
            const lunchBreak = savedTimes.times.breakTimes.find(
              (time: { id: number; period: string }) => time.period === 'LUNCH',
            )
            const pmBreak = savedTimes.times.breakTimes.find(
              (time: { id: number; period: string }) => time.period === 'PM',
            )
            if (amBreak?.id) setSelectedAMBreakTime(Number(amBreak.id))
            if (lunchBreak?.id) setSelectedLunchBreakTime(Number(lunchBreak.id))
            if (pmBreak?.id) setSelectedPMBreakTime(Number(pmBreak.id))
          }
        } else if (savedTimesResponse.status === 404) {
          // No saved times exist for this class - this is normal for new schedules
        } else {
          // Handle other errors
          console.warn('Failed to fetch saved times:', savedTimesResponse.status)
        }
      } catch (savedTimesError) {
        console.warn('Error fetching saved times:', savedTimesError)
        // Don't fail the entire operation if saved times can't be loaded
      } finally {
        setIsLoadingSavedTimes(false)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      setError('Failed to load times')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      // Validate that all required dropdowns are filled
      const errors: string[] = []

      if (periods.has('AM') && !selectedAMScheduleTime) {
        errors.push(t('admin.settings.times.errors.selectAMScheduleTime'))
      }
      if (periods.has('PM') && !selectedPMScheduleTime) {
        errors.push(t('admin.settings.times.errors.selectPMScheduleTime'))
      }
      // Break times are now optional - no validation required

      if (errors.length > 0) {
        setError(errors.join('\n'))
        setIsErrorDialogOpen(true)
        return
      }

      const scheduleTimes = []
      if (selectedAMScheduleTime) {
        scheduleTimes.push({ id: selectedAMScheduleTime })
      }
      if (selectedPMScheduleTime) {
        scheduleTimes.push({ id: selectedPMScheduleTime })
      }

      const breakTimes = []
      if (selectedAMBreakTime) {
        breakTimes.push({ id: selectedAMBreakTime })
      }
      if (selectedLunchBreakTime) {
        breakTimes.push({ id: selectedLunchBreakTime })
      }
      if (selectedPMBreakTime) {
        breakTimes.push({ id: selectedPMBreakTime })
      }

      if (!classId) throw new Error('Class ID not available')

      await saveTimesMutation.mutateAsync({
        classId,
        scheduleTimes,
        breakTimes,
        selectedWeekday: weekday ?? null,
      })

      if (onSave) {
        onSave()
      }
    } catch (error) {
      console.error('Error saving times:', error)
      setError(t('admin.settings.times.errors.saveFailed'))
      setIsErrorDialogOpen(true)
    }
  }

  const handleAddScheduleTime = async () => {
    if (isSubmittingScheduleTime) return

    try {
      setIsSubmittingScheduleTime(true)
      const response = await fetch('/api/admin/settings/schedule-times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newScheduleTime),
      })

      if (!response.ok) {
        throw new Error('Failed to add schedule time')
      }

      const data = await response.json()
      if (!data || typeof data.id !== 'number' || !['AM', 'PM'].includes(data.period as string)) {
        throw new Error('Invalid response format')
      }
      const periodsArray = Array.from(periods)
      if (periodsArray.includes(data.period as 'AM' | 'PM')) {
        setScheduleTimes([...scheduleTimes, data as ScheduleTime])
      }
      setNewScheduleTime({
        startTime: '',
        endTime: '',
        hours: 0,
        period: 'AM',
      })
      setSuccess(t('admin.settings.times.scheduleTimeAdded'))
    } catch (error) {
      console.error('Error adding schedule time:', error)
      setError(t('admin.settings.times.scheduleTimeError'))
    } finally {
      setIsSubmittingScheduleTime(false)
    }
  }

  const handleAddBreakTime = async () => {
    try {
      const response = await fetch('/api/admin/settings/break-times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newBreakTime),
      })

      if (!response.ok) {
        throw new Error('Failed to add break time')
      }

      const data = (await response.json()) as BreakTime
      setBreakTimes([...breakTimes, data])
      setNewBreakTime({
        name: '',
        startTime: '',
        endTime: '',
        period: 'AM',
      })
      setSuccess(t('admin.settings.times.breakTimeAdded'))
    } catch (error) {
      console.error('Error adding break time:', error)
      setError(t('admin.settings.times.breakTimeError'))
    }
  }

  if (isLoading)
    return (
      <div className="flex min-h-[200px] items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    )

  // --- Derive the live day-axis from the current selection ---------------------
  const amLesson = scheduleTimes.find(
    time => time.id === selectedAMScheduleTime && time.period === 'AM',
  )
  const pmLesson = scheduleTimes.find(
    time => time.id === selectedPMScheduleTime && time.period === 'PM',
  )
  const amBreak = breakTimes.find(time => time.id === selectedAMBreakTime && time.period === 'AM')
  const lunchBreak = breakTimes.find(
    time => time.id === selectedLunchBreakTime && time.period === 'LUNCH',
  )
  const pmBreak = breakTimes.find(time => time.id === selectedPMBreakTime && time.period === 'PM')

  const dayBlocks: DayBlock[] = [
    amLesson && {
      key: 'am-lesson',
      label: t('schedule:morning'),
      start: amLesson.startTime,
      end: amLesson.endTime,
      kind: 'lesson' as const,
    },
    amBreak && {
      key: 'am-break',
      label: amBreak.name,
      start: amBreak.startTime,
      end: amBreak.endTime,
      kind: 'break' as const,
    },
    lunchBreak && {
      key: 'lunch-break',
      label: lunchBreak.name,
      start: lunchBreak.startTime,
      end: lunchBreak.endTime,
      kind: 'break' as const,
    },
    pmLesson && {
      key: 'pm-lesson',
      label: t('schedule:afternoon'),
      start: pmLesson.startTime,
      end: pmLesson.endTime,
      kind: 'lesson' as const,
    },
    pmBreak && {
      key: 'pm-break',
      label: pmBreak.name,
      start: pmBreak.startTime,
      end: pmBreak.endTime,
      kind: 'break' as const,
    },
  ].filter((b): b is DayBlock => Boolean(b))

  // Axis domain: a default 07:00–18:00 window, widened to hold anything selected.
  const blockMinutes = dayBlocks
    .flatMap(b => [toMinutes(b.start), toMinutes(b.end)])
    .filter(n => !Number.isNaN(n))
  const axisStart = Math.floor(Math.min(7 * 60, ...blockMinutes) / 60) * 60
  const axisEnd = Math.ceil(Math.max(18 * 60, ...blockMinutes) / 60) * 60
  const axisSpan = Math.max(axisEnd - axisStart, 1)

  const hourTicks: number[] = []
  for (let m = Math.ceil(axisStart / 60) * 60; m <= axisEnd; m += 60) {
    hourTicks.push(m)
  }

  const dayStart = blockMinutes.length ? Math.min(...blockMinutes) : NaN
  const dayEnd = blockMinutes.length ? Math.max(...blockMinutes) : NaN
  const daySpanLabel = Number.isNaN(dayStart)
    ? null
    : formatRange(minutesToLabel(dayStart), minutesToLabel(dayEnd))

  const weekdayName =
    weekday != null && !Number.isNaN(weekday) ? t(`schedule:weekdays.${weekday}`) : ''

  // --- Phase groups for the picker --------------------------------------------
  interface PhaseGroup {
    key: string
    icon: typeof Sunrise
    title: string
    lessons: ScheduleTime[]
    selectedLesson: number | null
    setLesson: (id: number | null) => void
    breakLabel: string
    breaks: BreakTime[]
    selectedBreak: number | null
    setBreak: (id: number | null) => void
  }

  const phaseGroups: PhaseGroup[] = (
    [
      periods.has('AM') && {
        key: 'AM',
        icon: Sunrise,
        title: t('schedule:morning'),
        lessons: scheduleTimes.filter(time => time.period === 'AM'),
        selectedLesson: selectedAMScheduleTime,
        setLesson: setSelectedAMScheduleTime,
        breakLabel: t('admin.settings.times.labels.amBreak'),
        breaks: breakTimes.filter(time => time.period === 'AM'),
        selectedBreak: selectedAMBreakTime,
        setBreak: setSelectedAMBreakTime,
      },
      periods.size > 0 && {
        key: 'LUNCH',
        icon: Coffee,
        title: t('schedule:lunch'),
        lessons: [] as ScheduleTime[],
        selectedLesson: null,
        setLesson: () => undefined,
        breakLabel: t('admin.settings.times.labels.lunchBreak'),
        breaks: breakTimes.filter(time => time.period === 'LUNCH'),
        selectedBreak: selectedLunchBreakTime,
        setBreak: setSelectedLunchBreakTime,
      },
      periods.has('PM') && {
        key: 'PM',
        icon: Sunset,
        title: t('schedule:afternoon'),
        lessons: scheduleTimes.filter(time => time.period === 'PM'),
        selectedLesson: selectedPMScheduleTime,
        setLesson: setSelectedPMScheduleTime,
        breakLabel: t('admin.settings.times.labels.pmBreak'),
        breaks: breakTimes.filter(time => time.period === 'PM'),
        selectedBreak: selectedPMBreakTime,
        setBreak: setSelectedPMBreakTime,
      },
    ] as (PhaseGroup | false)[]
  ).filter((g): g is PhaseGroup => g !== false)

  const chipClass = (active: boolean) =>
    cn(
      'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
      active
        ? 'border-primary bg-primary/10 text-foreground'
        : 'border-input hover:bg-accent text-foreground',
    )

  return (
    <>
      {success && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {isLoadingSavedTimes && (
        <Alert variant="info">
          <Spinner size="sm" />
          <AlertDescription>{t('admin.settings.times.loadingSavedTimes')}</AlertDescription>
        </Alert>
      )}

      {/* Day axis — a live picture of the selected day. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-lg tracking-tight">
            {weekdayName
              ? t('schedule:dayScheduleTitle', { weekday: weekdayName })
              : t('schedule:steps.times')}
          </CardTitle>
          {daySpanLabel && (
            <span className="text-muted-foreground text-sm tabular-nums">{daySpanLabel}</span>
          )}
        </CardHeader>
        <CardContent>
          {dayBlocks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('schedule:noTimeSelected')}</p>
          ) : (
            <>
              <div className="bg-muted/25 relative h-11 rounded-sm">
                {hourTicks.map(m => {
                  const left = ((m - axisStart) / axisSpan) * 100
                  return (
                    <div
                      key={`tick-${m}`}
                      aria-hidden="true"
                      className="bg-border/70 absolute top-0 bottom-0 w-px"
                      style={{ left: `${left}%` }}
                    />
                  )
                })}
                {dayBlocks.map(block => {
                  const start = toMinutes(block.start)
                  const end = toMinutes(block.end)
                  if (Number.isNaN(start) || Number.isNaN(end)) return null
                  const left = ((start - axisStart) / axisSpan) * 100
                  const width = ((end - start) / axisSpan) * 100
                  const wide = end - start >= 60
                  return (
                    <div
                      key={block.key}
                      title={formatRange(block.start, block.end)}
                      className={cn(
                        'absolute top-1 bottom-1 flex flex-col justify-center overflow-hidden rounded-sm border px-2',
                        block.kind === 'lesson'
                          ? 'border-primary/30 bg-primary/15'
                          : 'border-border bg-muted',
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {wide ? (
                        <>
                          <span className="truncate text-xs font-semibold whitespace-nowrap">
                            {block.label}
                          </span>
                          <span className="text-muted-foreground truncate text-[0.6875rem] whitespace-nowrap tabular-nums">
                            {formatRange(block.start, block.end)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground truncate text-[0.6875rem] font-medium whitespace-nowrap">
                          {block.label}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="relative mt-1.5 h-4">
                {hourTicks.map(m => {
                  const left = ((m - axisStart) / axisSpan) * 100
                  return (
                    <span
                      key={`label-${m}`}
                      className="text-muted-foreground absolute -translate-x-1/2 text-[0.6875rem] tabular-nums"
                      style={{ left: `${left}%` }}
                    >
                      {minutesToLabel(m)}
                    </span>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Time pickers, grouped by phase. */}
      <Card>
        <CardContent className="p-0">
          {phaseGroups.map((group, index) => {
            const Icon = group.icon
            return (
              <div
                key={group.key}
                className={cn(
                  'flex flex-col gap-6 px-6 py-5 sm:flex-row sm:items-start sm:gap-6',
                  index < phaseGroups.length - 1 && 'border-border/60 border-b',
                )}
              >
                <div className="flex shrink-0 items-center gap-2 pt-1 sm:w-40">
                  <Icon className="text-muted-foreground h-5 w-5" />
                  <span className="text-sm font-medium">{group.title}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  {group.lessons.length > 0 && (
                    <div>
                      <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                        {t('schedule:lessonTime')}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.lessons.map(time => (
                          <button
                            key={time.id}
                            type="button"
                            onClick={() => group.setLesson(time.id)}
                            className={chipClass(group.selectedLesson === time.id)}
                          >
                            <span className="font-semibold tabular-nums">
                              {formatRange(time.startTime, time.endTime)}
                            </span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {time.hours} {t('admin.settings.times.hours')}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                      {group.breakLabel}{' '}
                      <span className="normal-case">({t('admin.settings.times.optional')})</span>
                    </div>
                    {group.breaks.length === 0 ? (
                      <p className="text-muted-foreground text-sm">
                        {t('admin.settings.times.noBreaksAvailable')}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {group.breaks.map(time => (
                          <button
                            key={time.id}
                            type="button"
                            onClick={() =>
                              group.setBreak(group.selectedBreak === time.id ? null : time.id)
                            }
                            className={chipClass(group.selectedBreak === time.id)}
                          >
                            <span className="font-semibold">{time.name}</span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {formatRange(time.startTime, time.endTime)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Create new schedule / break times. */}
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <Card className="border-dashed">
              <CardHeader
                className="cursor-pointer py-2"
                onClick={() => setIsScheduleTimeFormOpen(!isScheduleTimeFormOpen)}
              >
                <CardTitle className="flex items-center justify-between text-sm">
                  {t('admin.settings.times.addNewScheduleTime')}
                  {isScheduleTimeFormOpen ? (
                    <ChevronDown className="text-muted-foreground h-4 w-4" />
                  ) : (
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  )}
                </CardTitle>
              </CardHeader>
              {isScheduleTimeFormOpen && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="startTime" className="text-sm">
                          {t('admin.settings.times.startTime')}
                        </Label>
                        <Input
                          type="time"
                          id="startTime"
                          value={newScheduleTime.startTime}
                          onChange={e =>
                            setNewScheduleTime({ ...newScheduleTime, startTime: e.target.value })
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="endTime" className="text-sm">
                          {t('admin.settings.times.endTime')}
                        </Label>
                        <Input
                          type="time"
                          id="endTime"
                          value={newScheduleTime.endTime}
                          onChange={e =>
                            setNewScheduleTime({ ...newScheduleTime, endTime: e.target.value })
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="hours" className="text-sm">
                          {t('admin.settings.times.hours')}
                        </Label>
                        <Input
                          type="number"
                          id="hours"
                          value={newScheduleTime.hours}
                          onChange={e =>
                            setNewScheduleTime({
                              ...newScheduleTime,
                              hours: e.target.valueAsNumber || 0,
                            })
                          }
                          className="h-8 text-sm"
                          min="0"
                          step="0.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="period" className="text-sm">
                          {t('admin.settings.times.period')}
                        </Label>
                        <select
                          id="period"
                          value={newScheduleTime.period}
                          onChange={e =>
                            setNewScheduleTime({
                              ...newScheduleTime,
                              period: e.target.value as 'AM' | 'PM',
                            })
                          }
                          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                        >
                          {periods.has('AM') && (
                            <option value="AM">{t('admin.settings.times.periods.AM')}</option>
                          )}
                          {periods.has('PM') && (
                            <option value="PM">{t('admin.settings.times.periods.PM')}</option>
                          )}
                        </select>
                      </div>
                    </div>
                    <Button
                      onClick={handleAddScheduleTime}
                      className="w-full"
                      size="sm"
                      disabled={isSubmittingScheduleTime}
                    >
                      {isSubmittingScheduleTime ? (
                        <Spinner size="sm" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      {isSubmittingScheduleTime
                        ? t('common:common.loading')
                        : t('admin.settings.times.addScheduleTime')}
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            <Card className="border-dashed">
              <CardHeader
                className="cursor-pointer py-2"
                onClick={() => setIsBreakTimeFormOpen(!isBreakTimeFormOpen)}
              >
                <CardTitle className="flex items-center justify-between text-sm">
                  {t('admin.settings.times.addNewBreakTime')}
                  {isBreakTimeFormOpen ? (
                    <ChevronDown className="text-muted-foreground h-4 w-4" />
                  ) : (
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  )}
                </CardTitle>
              </CardHeader>
              {isBreakTimeFormOpen && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div>
                      <Label htmlFor="breakName" className="text-sm">
                        {t('admin.settings.times.breakName')}
                      </Label>
                      <Input
                        type="text"
                        id="breakName"
                        value={newBreakTime.name}
                        onChange={e => setNewBreakTime({ ...newBreakTime, name: e.target.value })}
                        className="h-8 text-sm"
                        placeholder={t('admin.settings.times.breakNamePlaceholder')}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="breakStartTime" className="text-sm">
                          {t('admin.settings.times.startTime')}
                        </Label>
                        <Input
                          type="time"
                          id="breakStartTime"
                          value={newBreakTime.startTime}
                          onChange={e =>
                            setNewBreakTime({ ...newBreakTime, startTime: e.target.value })
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label htmlFor="breakEndTime" className="text-sm">
                          {t('admin.settings.times.endTime')}
                        </Label>
                        <Input
                          type="time"
                          id="breakEndTime"
                          value={newBreakTime.endTime}
                          onChange={e =>
                            setNewBreakTime({ ...newBreakTime, endTime: e.target.value })
                          }
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="breakPeriod" className="text-sm">
                        {t('admin.settings.times.period')}
                      </Label>
                      <select
                        id="breakPeriod"
                        value={newBreakTime.period}
                        onChange={e =>
                          setNewBreakTime({
                            ...newBreakTime,
                            period: e.target.value as 'AM' | 'PM' | 'LUNCH',
                          })
                        }
                        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                      >
                        {periods.has('AM') && (
                          <option value="AM">{t('admin.settings.times.periods.AM')}</option>
                        )}
                        <option value="LUNCH">{t('admin.settings.times.periods.LUNCH')}</option>
                        {periods.has('PM') && (
                          <option value="PM">{t('admin.settings.times.periods.PM')}</option>
                        )}
                      </select>
                    </div>
                    <Button onClick={handleAddBreakTime} className="w-full" size="sm">
                      <Plus className="h-4 w-4" />
                      {t('admin.settings.times.addBreakTime')}
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </CardContent>
      </Card>

      <WizardFooter
        back={
          onCancel && (
            <Button variant="outline" onClick={onCancel}>
              <ArrowLeft className="h-4 w-4" />
              {t('schedule:back')}
            </Button>
          )
        }
      >
        <Button onClick={handleSave} disabled={saveTimesMutation.isPending}>
          {saveTimesMutation.isPending ? t('common:common.loading') : t('schedule:next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </WizardFooter>

      <Dialog open={isErrorDialogOpen} onOpenChange={setIsErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {t('common:common.error')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground whitespace-pre-line">
              {error}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setIsErrorDialogOpen(false)}>{t('schedule:ok')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
