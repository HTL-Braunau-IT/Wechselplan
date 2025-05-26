'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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

export default function TimesPage() {
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [breakTimes, setBreakTimes] = useState<BreakTime[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form states
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

  const { t } = useTranslation()

  useEffect(() => {
    void Promise.all([fetchScheduleTimes(), fetchBreakTimes()])
  }, [])

  const fetchScheduleTimes = async () => {
    try {
      const response = await fetch('/api/admin/settings/schedule-times')
      if (!response.ok) {
        throw new Error('Failed to fetch schedule times')
      }
      const data = await response.json() as ScheduleTime[]
      setScheduleTimes(data)
    } catch (error) {
      console.error('Error fetching schedule times:', error)
      setError('Failed to load schedule times')
    }
  }

  const fetchBreakTimes = async () => {
    try {
      const response = await fetch('/api/admin/settings/break-times')
      if (!response.ok) {
        throw new Error('Failed to fetch break times')
      }
      const data = await response.json() as BreakTime[]
      setBreakTimes(data)
    } catch (error) {
      console.error('Error fetching break times:', error)
      setError('Failed to load break times')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddScheduleTime = async () => {
    try {
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

      const data = await response.json() as ScheduleTime
      setScheduleTimes([...scheduleTimes, data])
      setNewScheduleTime({
        startTime: '',
        endTime: '',
        hours: 0,
        period: 'AM'
      })
      setSuccess('Schedule time added successfully')
    } catch (error) {
      console.error('Error adding schedule time:', error)
      setError('Failed to add schedule time')
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
      setSuccess('Break time added successfully')
    } catch (error) {
      console.error('Error adding break time:', error)
      setError('Failed to add break time')
    }
  }

  const handleDeleteScheduleTime = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/settings/schedule-times/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete schedule time')
      }

      setScheduleTimes(scheduleTimes.filter(time => time.id !== id))
      setSuccess('Schedule time deleted successfully')
    } catch (error) {
      console.error('Error deleting schedule time:', error)
      setError('Failed to delete schedule time')
    }
  }

  const handleDeleteBreakTime = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/settings/break-times/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete break time')
      }

      setBreakTimes(breakTimes.filter(time => time.id !== id))
      setSuccess('Break time deleted successfully')
    } catch (error) {
      console.error('Error deleting break time:', error)
      setError('Failed to delete break time')
    }
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.settings.times.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-4">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="schedule" className="space-y-4">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="schedule" className="data-[state=active]:bg-background data-[state=active]:text-foreground">
                {t('admin.settings.times.scheduleTimes')}
              </TabsTrigger>
              <TabsTrigger value="breaks" className="data-[state=active]:bg-background data-[state=active]:text-foreground">
                {t('admin.settings.times.breakTimes')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="schedule">
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.times.scheduleTimes')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Add New Schedule Time</h2>
                    <div className="grid grid-cols-1 gap-4 mb-4">
                      <div>
                        <Label htmlFor="scheduleStartTime">Start Time</Label>
                        <Input
                          id="scheduleStartTime"
                          type="time"
                          value={newScheduleTime.startTime}
                          onChange={(e) => setNewScheduleTime({ ...newScheduleTime, startTime: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="scheduleEndTime">End Time</Label>
                        <Input
                          id="scheduleEndTime"
                          type="time"
                          value={newScheduleTime.endTime}
                          onChange={(e) => setNewScheduleTime({ ...newScheduleTime, endTime: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="scheduleHours">Hours</Label>
                        <Input
                          id="scheduleHours"
                          type="number"
                          step="0.5"
                          value={newScheduleTime.hours}
                          onChange={(e) => setNewScheduleTime({ ...newScheduleTime, hours: parseFloat(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="schedulePeriod">Period</Label>
                        <Select
                          value={newScheduleTime.period}
                          onValueChange={(value: 'AM' | 'PM') => setNewScheduleTime({ ...newScheduleTime, period: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select period" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AM">Morning</SelectItem>
                            <SelectItem value="PM">Afternoon</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button onClick={handleAddScheduleTime}>Add Schedule Time</Button>
                  </div>

                  <div className="mt-8">
                    <h2 className="text-xl font-semibold mb-4">Existing Schedule Times</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="border p-2">Start Time</th>
                            <th className="border p-2">End Time</th>
                            <th className="border p-2">Hours</th>
                            <th className="border p-2">Period</th>
                            <th className="border p-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scheduleTimes.map((time) => (
                            <tr key={time.id}>
                              <td className="border p-2">{time.startTime}</td>
                              <td className="border p-2">{time.endTime}</td>
                              <td className="border p-2">{time.hours}</td>
                              <td className="border p-2">{time.period}</td>
                              <td className="border p-2">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteScheduleTime(time.id)}
                                >
                                  Delete
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="breaks">
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.times.breakTimes')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">Add New Break Time</h2>
                    <div className="grid grid-cols-1 gap-4 mb-4">
                      <div>
                        <Label htmlFor="breakName">Break Name</Label>
                        <Input
                          id="breakName"
                          value={newBreakTime.name}
                          onChange={(e) => setNewBreakTime({ ...newBreakTime, name: e.target.value })}
                          placeholder="e.g., Morning Break"
                        />
                      </div>
                      <div>
                        <Label htmlFor="breakStartTime">Start Time</Label>
                        <Input
                          id="breakStartTime"
                          type="time"
                          value={newBreakTime.startTime}
                          onChange={(e) => setNewBreakTime({ ...newBreakTime, startTime: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="breakEndTime">End Time</Label>
                        <Input
                          id="breakEndTime"
                          type="time"
                          value={newBreakTime.endTime}
                          onChange={(e) => setNewBreakTime({ ...newBreakTime, endTime: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="breakPeriod">Period</Label>
                        <Select
                          value={newBreakTime.period}
                          onValueChange={(value: 'AM' | 'PM') => setNewBreakTime({ ...newBreakTime, period: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select period" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AM">Morning</SelectItem>
                            <SelectItem value="PM">Afternoon</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button onClick={handleAddBreakTime}>Add Break Time</Button>
                  </div>

                  <div className="mt-8">
                    <h2 className="text-xl font-semibold mb-4">Existing Break Times</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="border p-2 bg-muted">Name</th>
                            <th className="border p-2 bg-muted">Start Time</th>
                            <th className="border p-2 bg-muted">End Time</th>
                            <th className="border p-2 bg-muted">Period</th>
                            <th className="border p-2 bg-muted">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {breakTimes.map((time) => (
                            <tr key={time.id}>
                              <td className="border p-2">{time.name}</td>
                              <td className="border p-2">{time.startTime}</td>
                              <td className="border p-2">{time.endTime}</td>
                              <td className="border p-2">{time.period}</td>
                              <td className="border p-2">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteBreakTime(time.id)}
                                >
                                  Delete
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 