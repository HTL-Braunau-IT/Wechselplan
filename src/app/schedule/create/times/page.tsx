'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui/spinner'

interface ScheduleTime {
  id: number
  startTime: string
  endTime: string
  hours: number
  period: 'AM' | 'PM'
}

interface BreakTime {
  id: number
  name: string
  startTime: string
  endTime: string
  period: 'AM' | 'PM' | 'LUNCH'
}

interface TeacherAssignment {
  id: string
  period: 'AM' | 'PM'
}

interface SavedTimesResponse {
  scheduleTimes: { id: number }[]
  breakTimes: { id: number }[]
}

/**
 * React page component for managing schedule and break times for a class.
 *
 * Fetches teacher assignments, filters available schedule and break times by relevant periods, allows users to add new times, select existing times, and save selections for a class. Handles loading, error, and success states, and provides forms for adding new schedule and break times.
 *
 * @returns The rendered schedule and break times management page.
 */
export default function TimesPage() {
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [breakTimes, setBreakTimes] = useState<BreakTime[]>([])
  const [selectedAMScheduleTime, setSelectedAMScheduleTime] = useState<number | null>(null)
  const [selectedPMScheduleTime, setSelectedPMScheduleTime] = useState<number | null>(null)
  const [selectedAMBreakTime, setSelectedAMBreakTime] = useState<number | null>(null)
  const [selectedLunchBreakTime, setSelectedLunchBreakTime] = useState<number | null>(null)
  const [selectedPMBreakTime, setSelectedPMBreakTime] = useState<number | null>(null)
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([])
  const [periods, setPeriods] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmittingScheduleTime, setIsSubmittingScheduleTime] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation(['admin', 'common'])

  // New form states
  const [newScheduleTime, setNewScheduleTime] = useState<Partial<ScheduleTime>>({
    startTime: '',
    endTime: '',
    hours: 0,
    period: 'AM'
  })

  const [newBreakTime, setNewBreakTime] = useState<Partial<BreakTime>>({
    name: '',
    startTime: '',
    endTime: '',
    period: 'AM'
  })

  const [isScheduleTimeFormOpen, setIsScheduleTimeFormOpen] = useState(false)
  const [isBreakTimeFormOpen, setIsBreakTimeFormOpen] = useState(false)

  const className = searchParams.get('class')

  useEffect(() => {
    if (!className) {
      setError('Class ID is required')
      setIsLoading(false)
      return
    }
    void fetchData()
  }, [className])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Fetch teacher assignments first to determine which periods are needed
      const assignmentsResponse = await fetch(`/api/schedule/teacher-assignments?class=${className}`)
      if (!assignmentsResponse.ok) throw new Error('Failed to fetch teacher assignments')
      const assignmentsData = await assignmentsResponse.json()

      // Get unique periods from assignments
      const newPeriods = new Set<string>()
      if (assignmentsData.amAssignments?.length > 0) newPeriods.add('AM')
      if (assignmentsData.pmAssignments?.length > 0) newPeriods.add('PM')
      setPeriods(newPeriods)

      // Fetch schedule times
      const scheduleResponse = await fetch('/api/admin/settings/schedule-times')
      if (!scheduleResponse.ok) throw new Error('Failed to fetch schedule times')
      const scheduleData = await scheduleResponse.json() as ScheduleTime[]

      // Filter schedule times based on periods in assignments
      const filteredScheduleTimes = scheduleData.filter(time => newPeriods.has(time.period))
      setScheduleTimes(filteredScheduleTimes)

      // Fetch break times
      const breakResponse = await fetch('/api/admin/settings/break-times')
      if (!breakResponse.ok) throw new Error('Failed to fetch break times')
      const breakData = await breakResponse.json() as BreakTime[]
      
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
      const savedTimesResponse = await fetch(`/api/schedule/times?className=${className}`)
      if (savedTimesResponse.ok) {
        const savedTimes = await savedTimesResponse.json()
        
        // Set selected schedule times
        if (savedTimes.times.scheduleTimes && Array.isArray(savedTimes.times.scheduleTimes)) {
          const amTime = savedTimes.times.scheduleTimes.find((time: { id: number; period: string }) => time.period === 'AM')
          const pmTime = savedTimes.times.scheduleTimes.find((time: { id: number; period: string }) => time.period === 'PM')
          if (amTime?.id) setSelectedAMScheduleTime(Number(amTime.id))
          if (pmTime?.id) setSelectedPMScheduleTime(Number(pmTime.id))
        }

        // Set selected break times
        if (savedTimes.times.breakTimes && Array.isArray(savedTimes.times.breakTimes)) {
          const amBreak = savedTimes.times.breakTimes.find((time: { id: number; period: string }) => time.period === 'AM')
          const lunchBreak = savedTimes.times.breakTimes.find((time: { id: number; period: string }) => time.period === 'LUNCH')
          const pmBreak = savedTimes.times.breakTimes.find((time: { id: number; period: string }) => time.period === 'PM')
          if (amBreak?.id) setSelectedAMBreakTime(Number(amBreak.id))
          if (lunchBreak?.id) setSelectedLunchBreakTime(Number(lunchBreak.id))
          if (pmBreak?.id) setSelectedPMBreakTime(Number(pmBreak.id))
        }
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
        errors.push(t('settings.times.errors.selectAMScheduleTime'))
      }
      if (periods.has('PM') && !selectedPMScheduleTime) {
        errors.push(t('settings.times.errors.selectPMScheduleTime'))
      }
      if (periods.has('AM') && !selectedAMBreakTime) {
        errors.push(t('settings.times.errors.selectAMBreakTime'))
      }
      if (periods.size > 0 && !selectedLunchBreakTime) {
        errors.push(t('settings.times.errors.selectLunchBreakTime'))
      }
      if (periods.has('PM') && !selectedPMBreakTime) {
        errors.push(t('settings.times.errors.selectPMBreakTime'))
      }

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

      const response = await fetch('/api/schedule/times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          className: className,
          scheduleTimes,
          breakTimes,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save times')
      }

      router.push(`/schedule/create/overview?class=${className}`) // Navigate to the overview step with class parameter
    } catch (error) {
      console.error('Error saving times:', error)
      setError(t('settings.times.errors.saveFailed'))
      setIsErrorDialogOpen(true)
    }
  }

  const handleAddScheduleTime = async () => {
    if (isSubmittingScheduleTime) return;
    
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
      const periods = [...new Set(teacherAssignments.map((a: TeacherAssignment) => a.period))]
      if (periods.includes(data.period as 'AM' | 'PM')) {
        setScheduleTimes([...scheduleTimes, data as ScheduleTime])
      }
      setNewScheduleTime({
        startTime: '',
        endTime: '',
        hours: 0,
        period: 'AM'
      })
      setSuccess(t('settings.times.scheduleTimeAdded'))
    } catch (error) {
      console.error('Error adding schedule time:', error)
      setError(t('settings.times.scheduleTimeError'))
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

      const data = await response.json() as BreakTime
      setBreakTimes([...breakTimes, data])
      setNewBreakTime({
        name: '',
        startTime: '',
        endTime: '',
        period: 'AM'
      })
      setSuccess(t('settings.times.breakTimeAdded'))
    } catch (error) {
      console.error('Error adding break time:', error)
      setError(t('settings.times.breakTimeError'))
    }
  }

  if (isLoading) return (
    <div className="p-8 flex items-center justify-center min-h-[200px]">
      <Spinner size="lg" />
    </div>
  )


  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.times.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {success && (
            <div className="mb-4 p-4 text-green-500 bg-green-50 rounded-md">
              {success}
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
                    <h3 className="text-lg font-medium mb-3">AM Schedule Time</h3>
                    <select
                      value={selectedAMScheduleTime ?? ''}
                      onChange={(e) => setSelectedAMScheduleTime(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Select AM schedule time</option>
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
                    <h3 className="text-lg font-medium mb-3">PM Schedule Time</h3>
                    <select
                      value={selectedPMScheduleTime ?? ''}
                      onChange={(e) => setSelectedPMScheduleTime(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Select PM schedule time</option>
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
                    <h3 className="text-lg font-medium mb-3">AM Break</h3>
                    <select
                      value={selectedAMBreakTime ?? ''}
                      onChange={(e) => setSelectedAMBreakTime(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Select AM break</option>
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
                    <h3 className="text-lg font-medium mb-3">Lunch Break</h3>
                    <select
                      value={selectedLunchBreakTime ?? ''}
                      onChange={(e) => setSelectedLunchBreakTime(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Select lunch break</option>
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
                    <h3 className="text-lg font-medium mb-3">PM Break</h3>
                    <select
                      value={selectedPMBreakTime ?? ''}
                      onChange={(e) => setSelectedPMBreakTime(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full p-2 border rounded"
                    >
                      <option value="">Select PM break</option>
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

          {/* Creation Forms */}
          <div className="mt-8 space-y-4">
            <Card>
              <CardHeader className="cursor-pointer" onClick={() => setIsScheduleTimeFormOpen(!isScheduleTimeFormOpen)}>
                <CardTitle className="flex items-center justify-between">
                  {t('settings.times.addNewScheduleTime')}
                  <span className="text-sm text-gray-500">
                    {isScheduleTimeFormOpen ? '▼' : '▶'}
                  </span>
                </CardTitle>
              </CardHeader>
              {isScheduleTimeFormOpen && (
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="startTime">{t('settings.times.startTime')}</Label>
                        <input
                          type="time"
                          id="startTime"
                          value={newScheduleTime.startTime}
                          onChange={(e) => setNewScheduleTime({ ...newScheduleTime, startTime: e.target.value })}
                          className="w-full p-2 border rounded"
                        />
                      </div>
                      <div>
                        <Label htmlFor="endTime">{t('settings.times.endTime')}</Label>
                        <input
                          type="time"
                          id="endTime"
                          value={newScheduleTime.endTime}
                          onChange={(e) => setNewScheduleTime({ ...newScheduleTime, endTime: e.target.value })}
                          className="w-full p-2 border rounded"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="hours">{t('settings.times.hours')}</Label>
                        <input
                          type="number"
                          id="hours"
                          value={newScheduleTime.hours}
                          onChange={(e) => setNewScheduleTime({ ...newScheduleTime, hours: e.target.valueAsNumber || 0 })}
                          className="w-full p-2 border rounded"
                          min="0"
                          step="0.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="period">{t('settings.times.period')}</Label>
                        <select
                          id="period"
                          value={newScheduleTime.period}
                          onChange={(e) => setNewScheduleTime({ ...newScheduleTime, period: e.target.value as 'AM' | 'PM' })}
                          className="w-full p-2 border rounded"
                        >
                          {periods.has('AM') && <option value="AM">AM</option>}
                          {periods.has('PM') && <option value="PM">PM</option>}
                        </select>
                      </div>
                    </div>
                    <Button 
                      onClick={handleAddScheduleTime} 
                      className="w-full"
                      disabled={isSubmittingScheduleTime}
                    >
                      {isSubmittingScheduleTime 
                        ? t('common:common.loading') 
                        : t('settings.times.addScheduleTime')}
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader className="cursor-pointer" onClick={() => setIsBreakTimeFormOpen(!isBreakTimeFormOpen)}>
                <CardTitle className="flex items-center justify-between">
                  {t('settings.times.addNewBreakTime')}
                  <span className="text-sm text-gray-500">
                    {isBreakTimeFormOpen ? '▼' : '▶'}
                  </span>
                </CardTitle>
              </CardHeader>
              {isBreakTimeFormOpen && (
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="breakName">{t('settings.times.breakName')}</Label>
                      <input
                        type="text"
                        id="breakName"
                        value={newBreakTime.name}
                        onChange={(e) => setNewBreakTime({ ...newBreakTime, name: e.target.value })}
                        className="w-full p-2 border rounded"
                        placeholder={t('settings.times.breakNamePlaceholder')}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="breakStartTime">{t('settings.times.startTime')}</Label>
                        <input
                          type="time"
                          id="breakStartTime"
                          value={newBreakTime.startTime}
                          onChange={(e) => setNewBreakTime({ ...newBreakTime, startTime: e.target.value })}
                          className="w-full p-2 border rounded"
                        />
                      </div>
                      <div>
                        <Label htmlFor="breakEndTime">{t('settings.times.endTime')}</Label>
                        <input
                          type="time"
                          id="breakEndTime"
                          value={newBreakTime.endTime}
                          onChange={(e) => setNewBreakTime({ ...newBreakTime, endTime: e.target.value })}
                          className="w-full p-2 border rounded"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="breakPeriod">{t('settings.times.period')}</Label>
                      <select
                        id="breakPeriod"
                        value={newBreakTime.period}
                        onChange={(e) => setNewBreakTime({ ...newBreakTime, period: e.target.value as 'AM' | 'PM' | 'LUNCH' })}
                        className="w-full p-2 border rounded"
                      >
                        {periods.has('AM') && <option value="AM">AM</option>}
                        <option value="LUNCH">LUNCH</option>
                        {periods.has('PM') && <option value="PM">PM</option>}
                      </select>
                    </div>
                    <Button onClick={handleAddBreakTime} className="w-full">
                      {t('settings.times.addBreakTime')}
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          <div className="mt-8 flex justify-end gap-4">
            <Button variant="outline" onClick={() => router.back()}>
              {t('common:common.cancel')}
            </Button>
            <Button onClick={handleSave}>
              {t('common:common.next')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isErrorDialogOpen} onOpenChange={setIsErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common:common.error')}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {error}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button onClick={() => setIsErrorDialogOpen(false)}>
              {t('common:common.ok')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 