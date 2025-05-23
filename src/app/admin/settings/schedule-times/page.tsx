'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ScheduleTime {
  id: number
  startTime: string
  endTime: string
  hours: number
  period: 'AM' | 'PM'
}

export default function ScheduleTimesPage() {
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form states
  const [newScheduleTime, setNewScheduleTime] = useState<Partial<ScheduleTime>>({
    startTime: '',
    endTime: '',
    hours: 0,
    period: 'AM'
  })

  useEffect(() => {
    void fetchTimes()
  }, [])

  const fetchTimes = async () => {
    try {
      const response = await fetch('/api/admin/settings/schedule-times')
      if (!response.ok) {
        throw new Error('Failed to fetch times')
      }
      const data = await response.json()
      setScheduleTimes(data)
    } catch (error) {
      console.error('Error fetching times:', error)
      setError('Failed to load times')
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

      const data = await response.json()
      setScheduleTimes([...scheduleTimes, data])
      setNewScheduleTime({
        startTime: '',
        endTime: '',
        hours: 0,
        period: 'AM'
      })
    } catch (error) {
      console.error('Error adding schedule time:', error)
      setError('Failed to add schedule time')
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
    } catch (error) {
      console.error('Error deleting schedule time:', error)
      setError('Failed to delete schedule time')
    }
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Manage Schedule Times</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Add New Schedule Time</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={newScheduleTime.startTime}
                  onChange={(e) => setNewScheduleTime({ ...newScheduleTime, startTime: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="endTime">End Time</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={newScheduleTime.endTime}
                  onChange={(e) => setNewScheduleTime({ ...newScheduleTime, endTime: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="hours">Hours</Label>
                <Input
                  id="hours"
                  type="number"
                  step="0.5"
                  value={newScheduleTime.hours}
                  onChange={(e) => setNewScheduleTime({ ...newScheduleTime, hours: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="period">Period</Label>
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

          {error && (
            <div className="mt-4 text-red-500">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 