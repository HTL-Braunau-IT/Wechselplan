'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addWeeks, format, eachWeekOfInterval, setDay, getDay, isWithinInterval } from 'date-fns'
import { de } from 'date-fns/locale'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface WeekInfo {
  week: string
  date: string
}

interface Holiday {
  id: number
  name: string
  startDate: Date
  endDate: Date
}

type Schedule = Record<string, WeekInfo[]>

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' }
]

export default function RotationPage() {
  const [schedule, setSchedule] = useState<Schedule>({})
  const [numberOfTerms, setNumberOfTerms] = useState(4) // Default to 4 terms
  const [selectedWeekday, setSelectedWeekday] = useState(1) // Default to Monday
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Calculate the school year dates (example: from September to June)
  const currentYear = new Date().getFullYear()
  const schoolYearStart = new Date(currentYear, 8, 1) // September 1st
  const schoolYearEnd = new Date(currentYear + 1, 5, 30) // June 30th

  useEffect(() => {
    void fetchHolidays()
  }, [])

  useEffect(() => {
    if (!isLoading) {
      calculateSchedule()
    }
  }, [numberOfTerms, selectedWeekday, holidays, isLoading])

  const fetchHolidays = async () => {
    try {
      const response = await fetch('/api/settings/holidays')
      if (!response.ok) throw new Error('Failed to fetch holidays')
      const data = await response.json() as Holiday[]
      setHolidays(data.map(holiday => ({
        ...holiday,
        startDate: new Date(holiday.startDate),
        endDate: new Date(holiday.endDate)
      })))
    } catch (error) {
      console.error('Error fetching holidays:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const isHoliday = (date: Date): boolean => {
    return holidays.some(holiday => 
      isWithinInterval(date, {
        start: holiday.startDate,
        end: holiday.endDate
      })
    )
  }

  const calculateSchedule = () => {
    const newSchedule: Schedule = {}
    
    // Start from the beginning of the school year
    let currentDate = new Date(schoolYearStart)
    
    // Adjust to the selected weekday
    currentDate = setDay(currentDate, selectedWeekday)
    
    // If the adjusted date is before the school year start, move to next week
    if (currentDate < schoolYearStart) {
      currentDate = addWeeks(currentDate, 1)
    }
    
    // Calculate weeks per period based on total school year weeks and number of terms
    const totalWeeks = Math.floor((schoolYearEnd.getTime() - currentDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const weeksPerPeriod = Math.floor(totalWeeks / numberOfTerms)

    for (let i = 0; i < numberOfTerms; i++) {
      const turnusKey = `TURNUS ${i + 1}`
      const periodStart = new Date(currentDate)
      const periodEnd = addWeeks(periodStart, weeksPerPeriod)
      
      const weeks = eachWeekOfInterval({
        start: periodStart,
        end: periodEnd
      })

      newSchedule[turnusKey] = weeks
        .map((week: Date) => {
          // Ensure each date is on the selected weekday
          const adjustedDate = setDay(week, selectedWeekday)
          return {
            week: `KW${getWeekNumber(adjustedDate)}`,
            date: format(adjustedDate, 'dd.MM.yy'),
            isHoliday: isHoliday(adjustedDate)
          }
        })
        .filter(week => !week.isHoliday) // Remove holiday weeks
        .map(({ week, date }) => ({ week, date }))

      currentDate = periodEnd
    }

    setSchedule(newSchedule)
  }

  const getWeekNumber = (date: Date): number => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Rotation Periods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-8 mb-4">
            <div>
              <Label htmlFor="numberOfTerms">Number of Terms</Label>
              <Input
                id="numberOfTerms"
                type="number"
                value={numberOfTerms}
                onChange={(e) => setNumberOfTerms(parseInt(e.target.value))}
                min={1}
                max={10}
                className="w-32"
              />
            </div>
            <div>
              <Label htmlFor="weekday">Rotation Day</Label>
              <Select
                value={selectedWeekday.toString()}
                onValueChange={(value) => setSelectedWeekday(parseInt(value))}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select weekday" />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((day) => (
                    <SelectItem key={day.value} value={day.value.toString()}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {Object.keys(schedule).map((turnus) => (
                    <th key={turnus} className="border p-2">
                      {turnus}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.values(schedule)[0]?.map((_, weekIndex) => (
                  <tr key={weekIndex}>
                    {Object.values(schedule).map((turnus, turnusIndex) => (
                      <td key={turnusIndex} className="border p-2">
                        {turnus[weekIndex] && (
                          <>
                            {turnus[weekIndex].week}
                            <br />
                            {turnus[weekIndex].date}
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end gap-4">
            <Button variant="outline" onClick={() => window.history.back()}>
              Back
            </Button>
            <Button onClick={() => console.log('Save schedule')}>
              Save Schedule
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 