'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'

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
  period: 'AM' | 'PM'
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
  const [selectedScheduleTimes, setSelectedScheduleTimes] = useState<number[]>([])
  const [selectedBreakTimes, setSelectedBreakTimes] = useState<number[]>([])
  const [teacherAssignments, setTeacherAssignments] = useState<TeacherAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

  const classId = searchParams.get('class')

  useEffect(() => {
    if (!classId) {
      setError('Class ID is required')
      setIsLoading(false)
      return
    }
    void fetchData()
  }, [classId])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Fetch teacher assignments first to determine which periods are needed
      const assignmentsResponse = await fetch(`/api/schedules/assignments?class=${classId}`)
      if (!assignmentsResponse.ok) throw new Error('Failed to fetch teacher assignments')
      const assignments = await assignmentsResponse.json() as TeacherAssignment[]
      setTeacherAssignments(assignments)

      // Get unique periods from assignments
      const periods = [...new Set(assignments.map(a => a.period))]

      // Fetch schedule times
      const scheduleResponse = await fetch('/api/settings/schedule-times')
      if (!scheduleResponse.ok) throw new Error('Failed to fetch schedule times')
      const scheduleData = await scheduleResponse.json() as ScheduleTime[]
      // Filter schedule times based on periods in assignments
      setScheduleTimes(scheduleData.filter(time => periods.includes(time.period)))

      // Fetch break times
      const breakResponse = await fetch('/api/settings/break-times')
      if (!breakResponse.ok) throw new Error('Failed to fetch break times')
      const breakData = await breakResponse.json() as BreakTime[]
      // Filter break times based on periods in assignments
      setBreakTimes(breakData.filter(time => periods.includes(time.period)))

      // Fetch saved times for this class
      const savedTimesResponse = await fetch(`/api/schedules/times?class=${classId}`)
      if (savedTimesResponse.ok) {
        const savedTimes = await savedTimesResponse.json() as SavedTimesResponse
        setSelectedScheduleTimes(savedTimes.scheduleTimes.map(time => time.id))
        setSelectedBreakTimes(savedTimes.breakTimes.map(time => time.id))
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      setError('Failed to load times')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleScheduleTime = (id: number) => {
    setSelectedScheduleTimes(prev =>
      prev.includes(id)
        ? prev.filter(timeId => timeId !== id)
        : [...prev, id]
    )
  }

  const toggleBreakTime = (id: number) => {
    setSelectedBreakTimes(prev =>
      prev.includes(id)
        ? prev.filter(timeId => timeId !== id)
        : [...prev, id]
    )
  }

  const handleSave = async () => {
    try {
      const response = await fetch('/api/schedules/times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleTimes: selectedScheduleTimes,
          breakTimes: selectedBreakTimes,
          classId
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save times')
      }

      router.push(`/schedule/create/overview?class=${classId}`) // Navigate to the overview step with class parameter
    } catch (error) {
      console.error('Error saving times:', error)
      setError('Failed to save times')
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
      if (!data || typeof data.id !== 'number' || !['AM', 'PM'].includes(data.period)) {
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

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.times.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 text-red-500 bg-red-50 rounded-md">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-4 text-green-500 bg-green-50 rounded-md">
              {success}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Schedule Times */}
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('settings.times.scheduleTimes')}</h2>
              
              {/* Add new schedule time form */}
              <div className="mb-6 p-4 border rounded-lg">
                <h3 className="text-lg font-medium mb-3">{t('settings.times.addNewScheduleTime')}</h3>
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
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
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
              </div>

              {/* Existing schedule times */}
              <div className="space-y-4">
                {scheduleTimes.map(time => (
                  <div key={time.id} className="flex items-center space-x-4 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <Checkbox
                      id={`schedule-${time.id}`}
                      checked={selectedScheduleTimes.includes(time.id)}
                      onCheckedChange={() => toggleScheduleTime(time.id)}
                      className="h-5 w-5 border-2 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <Label htmlFor={`schedule-${time.id}`} className="flex-1 cursor-pointer">
                      {time.startTime} - {time.endTime} | {time.hours} {t('settings.times.hours')} ({time.period})
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Break Times */}
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('settings.times.breakTimes')}</h2>
              
              {/* Add new break time form */}
              <div className="mb-6 p-4 border rounded-lg">
                <h3 className="text-lg font-medium mb-3">{t('settings.times.addNewBreakTime')}</h3>
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
                      onChange={(e) => setNewBreakTime({ ...newBreakTime, period: e.target.value as 'AM' | 'PM' })}
                      className="w-full p-2 border rounded"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                  <Button onClick={handleAddBreakTime} className="w-full">
                    {t('settings.times.addBreakTime')}
                  </Button>
                </div>
              </div>

              {/* Existing break times */}
              <div className="space-y-4">
                {breakTimes.map(time => (
                  <div key={time.id} className="flex items-center space-x-4 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <Checkbox
                      id={`break-${time.id}`}
                      checked={selectedBreakTimes.includes(time.id)}
                      onCheckedChange={() => toggleBreakTime(time.id)}
                      className="h-5 w-5 border-2 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <Label htmlFor={`break-${time.id}`} className="flex-1 cursor-pointer">
                      {time.name}: {time.startTime} - {time.endTime} ({time.period})
                    </Label>
                  </div>
                ))}
              </div>
            </div>
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
    </div>
  )
} 