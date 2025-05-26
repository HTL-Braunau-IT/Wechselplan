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

export default function TimesPage() {
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [breakTimes, setBreakTimes] = useState<BreakTime[]>([])
  const [selectedScheduleTimes, setSelectedScheduleTimes] = useState<number[]>([])
  const [selectedBreakTimes, setSelectedBreakTimes] = useState<number[]>([])
  const [, setTeacherAssignments] = useState<TeacherAssignment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation(['admin', 'common'])

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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Schedule Times */}
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('settings.times.scheduleTimes')}</h2>
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
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave}>
              {t('common.next')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 