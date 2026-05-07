'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle } from 'lucide-react'
import { useClassDataByName } from '@/hooks/use-class-data'
import { useScheduleTimes } from '@/hooks/use-schedule-times'
import { useTeacherAssignments } from '@/hooks/use-teacher-assignments'
import { useSaveScheduleTimes } from '@/hooks/use-schedule-times'
import type { ScheduleTime, BreakTime } from '@/types/schedule'
import { fetchAndUnwrap, parseJsonSafe, unwrapData } from '@/lib/api-client'
import { useSchoolYear } from '@/contexts/school-year-context'

interface ScheduleTimesSelectorProps {
  className: string | null
  /** 1–5; when set, times are loaded/saved for that weekday’s schedule */
  weekday?: number | null
  onSave?: () => void
  onCancel?: () => void
}

/**
 * Component for managing schedule and break times for a selected class.
 *
 * Fetches teacher assignments to determine active periods, loads available schedule and break times,
 * and allows users to select or add new times for AM, PM, and lunch periods.
 */
export function ScheduleTimesSelector({ className, weekday, onSave, onCancel }: ScheduleTimesSelectorProps) {
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
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
  const { t } = useTranslation(['admin', 'common', 'schedule'])

  const [classId, setClassId] = useState<number | null>(null)

  // Resolve className to classId when className changes
  const { data: classData } = useClassDataByName(className ?? null)

  useEffect(() => {
    if (classData) {
      setClassId(classData.id)
    } else if (!className) {
      setClassId(null)
      setError(t('errors.classIdRequired'))
      setIsLoading(false)
    }
  }, [classData, className])

  // Fetch teacher assignments to determine periods
  const wd = weekday != null && weekday >= 1 && weekday <= 5 ? weekday : null
  const { data: teacherAssignmentsData } = useTeacherAssignments(classId, wd, schoolYearId)

  useScheduleTimes(classId, schoolYearId, wd ?? undefined)

  // Save mutation
  const saveTimesMutation = useSaveScheduleTimes()

  useEffect(() => {
    if (!className || !classId) {
      return
    }
    void fetchData()
  }, [className, classId, teacherAssignmentsData, wd, schoolYearId])

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
      const scheduleData = await fetchAndUnwrap<ScheduleTime[]>('/api/admin/settings/schedule-times')

      // Filter schedule times based on periods in assignments
      const filteredScheduleTimes = scheduleData.filter(time => newPeriods.has(time.period))
      setScheduleTimes(filteredScheduleTimes)

      // Fetch break times
      const breakData = await fetchAndUnwrap<BreakTime[]>('/api/admin/settings/break-times')

      // Filter break times based on periods and lunch breaks
      const filteredBreakTimes = breakData.filter(time => {
        // Always show lunch breaks if there are any assignments
        if (time.period === "LUNCH") {
          return newPeriods.size > 0 // Show lunch breaks if there are any AM or PM assignments
        }
        // For other breaks, filter by period
        return newPeriods.has(time.period)
      })

      setBreakTimes(filteredBreakTimes)

      // Fetch saved times for this class
      setIsLoadingSavedTimes(true)
      try {
        const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
        const wdQ = wd != null ? `&weekday=${wd}` : ''
        const savedTimesResponse = await fetch(`/api/schedules/times?classId=${classId}${yearQ}${wdQ}`)
        if (savedTimesResponse.ok) {
          const savedPayload = await parseJsonSafe(savedTimesResponse)
          const savedTimes = unwrapData<{ times: { scheduleTimes: Array<{ id: number; period: string }>; breakTimes: Array<{ id: number; period: string }> } }>(savedPayload)

          // Set selected schedule times
          if (savedTimes.times?.scheduleTimes && Array.isArray(savedTimes.times.scheduleTimes)) {
            const amTime = savedTimes.times.scheduleTimes.find((time: { id: number; period: string }) => time.period === 'AM')
            const pmTime = savedTimes.times.scheduleTimes.find((time: { id: number; period: string }) => time.period === 'PM')
            if (amTime?.id) setSelectedAMScheduleTime(Number(amTime.id))
            if (pmTime?.id) setSelectedPMScheduleTime(Number(pmTime.id))
          }

          // Set selected break times
          if (savedTimes.times?.breakTimes && Array.isArray(savedTimes.times.breakTimes)) {
            const amBreak = savedTimes.times.breakTimes.find((time: { id: number; period: string }) => time.period === 'AM')
            const lunchBreak = savedTimes.times.breakTimes.find((time: { id: number; period: string }) => time.period === 'LUNCH')
            const pmBreak = savedTimes.times.breakTimes.find((time: { id: number; period: string }) => time.period === 'PM')
            if (amBreak?.id) setSelectedAMBreakTime(Number(amBreak.id))
            if (lunchBreak?.id) setSelectedLunchBreakTime(Number(lunchBreak.id))
            if (pmBreak?.id) setSelectedPMBreakTime(Number(pmBreak.id))
          }
        } else if (savedTimesResponse.status === 404) {
          // No saved times exist for this class - this is normal for new schedules
          console.log('No saved times found for class:', className)
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
      setError(t('errors.loadTimes'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      // Validate that all required dropdowns are filled
      const errors: string[] = []

      if (periods.has('AM') && !selectedAMScheduleTime) {
        errors.push(t('settings.times.errors.selectAMScheduleTime'))
      }
      if (periods.has('PM') && !selectedPMScheduleTime) {
        errors.push(t('settings.times.errors.selectPMScheduleTime'))
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
        ...(schoolYearId != null && { schoolYearId }),
        ...(wd != null && { weekday: wd }),
        scheduleTimes,
        breakTimes
      })

      if (onSave) {
        onSave()
      }
    } catch (error) {
      console.error('Error saving times:', error)
      setError(t('settings.times.errors.saveFailed'))
      setIsErrorDialogOpen(true)
    }
  }

  if (isLoading) return (
    <div className="p-8 flex items-center justify-center min-h-[200px]">
      <Spinner size="lg" />
    </div>
  )

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.times.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
            {t('schedule:help.times')}
          </div>
          {success && (
            <div className="mb-4 p-4 text-green-500 bg-green-50 rounded-md">
              {success}
            </div>
          )}

          {isLoadingSavedTimes && (
            <div className="mb-4 p-4 text-blue-500 bg-blue-50 rounded-md flex items-center gap-2">
              <Spinner size="sm" />
              {t('settings.times.loadingSavedTimes')}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Schedule Times */}
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('settings.times.scheduleTimes')}</h2>

              {/* Existing schedule times */}
              <div className="space-y-6">
                {periods.has('AM') && (
                  <div>
                    <h3 className="text-lg font-medium mb-3">{t('settings.times.labels.amScheduleTime')}</h3>
                    <select
                      value={selectedAMScheduleTime ?? ''}
                      onChange={(e) => setSelectedAMScheduleTime(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">{t('settings.times.select.amScheduleTime')}</option>
                      {scheduleTimes
                        .filter(time => time.period === 'AM')
                        .map(time => (
                          <option key={time.id} value={time.id}>
                            {time.startTime} - {time.endTime} | {time.hours} {t('settings.times.hours')}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {periods.has('PM') && (
                  <div>
                    <h3 className="text-lg font-medium mb-3">{t('settings.times.labels.pmScheduleTime')}</h3>
                    <select
                      value={selectedPMScheduleTime ?? ''}
                      onChange={(e) => setSelectedPMScheduleTime(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">{t('settings.times.select.pmScheduleTime')}</option>
                      {scheduleTimes
                        .filter(time => time.period === 'PM')
                        .map(time => (
                          <option key={time.id} value={time.id}>
                            {time.startTime} - {time.endTime} | {time.hours} {t('settings.times.hours')}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Break Times */}
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('settings.times.breakTimes')}</h2>

              {/* Existing break times */}
              <div className="space-y-6">
                {periods.has('AM') && (
                  <div>
                    <h3 className="text-lg font-medium mb-3">
                      {t('settings.times.labels.amBreak')} <span className="text-sm text-gray-500 font-normal"></span>
                    </h3>
                    <select
                      value={selectedAMBreakTime ?? ''}
                      onChange={(e) => setSelectedAMBreakTime(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">{t('settings.times.select.amBreak')}</option>
                      {breakTimes
                        .filter(time => time.period === 'AM')
                        .map(time => (
                          <option key={time.id} value={time.id}>
                            {time.name}: {time.startTime} - {time.endTime}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {periods.size > 0 && (
                  <div>
                    <h3 className="text-lg font-medium mb-3">
                      {t('settings.times.labels.lunchBreak')} <span className="text-sm text-gray-500 font-normal"></span>
                    </h3>
                    <select
                      value={selectedLunchBreakTime ?? ''}
                      onChange={(e) => setSelectedLunchBreakTime(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">{t('settings.times.select.lunchBreak')}</option>
                      {breakTimes
                        .filter(time => time.period === 'LUNCH')
                        .map(time => (
                          <option key={time.id} value={time.id}>
                            {time.name}: {time.startTime} - {time.endTime}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {periods.has('PM') && (
                  <div>
                    <h3 className="text-lg font-medium mb-3">
                      {t('settings.times.labels.pmBreak')} <span className="text-sm text-gray-500 font-normal">({t('settings.times.optional')})</span>
                    </h3>
                    <select
                      value={selectedPMBreakTime ?? ''}
                      onChange={(e) => setSelectedPMBreakTime(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">{t('settings.times.select.pmBreak')}</option>
                      {breakTimes
                        .filter(time => time.period === 'PM')
                        .map(time => (
                          <option key={time.id} value={time.id}>
                            {time.name}: {time.startTime} - {time.endTime}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-4">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                {t('schedule:back')}
              </Button>
            )}
            <Button onClick={handleSave} disabled={saveTimesMutation.isPending}>
              {saveTimesMutation.isPending ? t('common:common.loading') : t('schedule:next')}
            </Button>
          </div>
        </CardContent>
      </Card>

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
            <Button onClick={() => setIsErrorDialogOpen(false)}>
              {t('schedule:ok')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

