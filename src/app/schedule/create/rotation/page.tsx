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
  isHoliday: boolean
}

interface Holiday {
  id: number
  name: string
  startDate: Date
  endDate: Date
}

type ScheduleEntry = {
  weeks: WeekInfo[]
  holidays: Holiday[]
}

type Schedule = Record<string, ScheduleEntry>

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
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<Date>(new Date())
  const [endDate, setEndDate] = useState<Date>(new Date())

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
    // Set time to midnight for the check date
    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    
    return holidays.some(holiday => {
      // Set time to midnight for holiday start and end dates
      const holidayStart = new Date(holiday.startDate.getFullYear(), holiday.startDate.getMonth(), holiday.startDate.getDate())
      const holidayEnd = new Date(holiday.endDate.getFullYear(), holiday.endDate.getMonth(), holiday.endDate.getDate())
      
      const isHoliday = isWithinInterval(checkDate, {
        start: holidayStart,
        end: holidayEnd
      })
      
      // Debug log
      if (format(checkDate, 'dd.MM.yy') === '01.09.25') {
        console.log('Checking date:', format(checkDate, 'dd.MM.yyyy'))
        console.log('Holiday:', holiday.name, format(holidayStart, 'dd.MM.yyyy'), format(holidayEnd, 'dd.MM.yyyy'))
        console.log('Is holiday:', isHoliday)
      }
      
      return isHoliday
    })
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

      // First, map all weeks with their holiday status
      const weeksWithHolidays = weeks.map((week: Date) => {
        // Ensure each date is on the selected weekday
        const adjustedDate = setDay(week, selectedWeekday)
        const isHolidayDate = isHoliday(adjustedDate)
        
        return {
          week: `KW${getWeekNumber(adjustedDate)}`,
          date: format(adjustedDate, 'dd.MM.yy'),
          isHoliday: isHolidayDate,
          originalDate: adjustedDate // Keep the original date for holiday checking
        }
      })

      // Store the full date range for holiday checking
      const turnDateRange = {
        start: weeksWithHolidays[0]?.originalDate,
        end: weeksWithHolidays[weeksWithHolidays.length - 1]?.originalDate
      }

      // Filter out holiday weeks for the schedule
      const turnHolidays = holidays.filter(holiday => {
        if (!turnDateRange.start || !turnDateRange.end) return false
        
        // Check if the holiday falls within the turn's date range
        const holidayStart = new Date(holiday.startDate.getFullYear(), holiday.startDate.getMonth(), holiday.startDate.getDate())
        const holidayEnd = new Date(holiday.endDate.getFullYear(), holiday.endDate.getMonth(), holiday.endDate.getDate())
        
        const isInDateRange = isWithinInterval(holidayStart, {
          start: turnDateRange.start,
          end: turnDateRange.end
        }) || isWithinInterval(holidayEnd, {
          start: turnDateRange.start,
          end: turnDateRange.end
        }) || isWithinInterval(turnDateRange.start, {
          start: holidayStart,
          end: holidayEnd
        })
        
        if (!isInDateRange) return false
        
        // Check if the holiday falls on our selected weekday
        const holidayStartDay = getDay(holidayStart)
        const holidayEndDay = getDay(holidayEnd)
        
        // If holiday spans multiple days, check if our selected weekday falls within it
        if (holidayStartDay !== holidayEndDay) {
          return true // Include multi-day holidays
        }
        
        // For single-day holidays, only include if they fall on our selected weekday
        return holidayStartDay === selectedWeekday
      })

      // Store the holidays for this turn
      newSchedule[turnusKey] = {
        weeks: weeksWithHolidays
          .filter(week => !week.isHoliday)
          .map(({ week, date }) => ({ week, date, isHoliday: false })),
        holidays: turnHolidays
      }

      currentDate = periodEnd
    }

    setSchedule(newSchedule)
  }

  const getWeekNumber = (date: Date): number => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveError(null)

      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Rotation Schedule',
          description: `Rotation schedule for ${selectedClass || 'all classes'}`,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          selectedWeekday,
          schedule,
          classId: selectedClass
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save schedule')
      }

      // Show success message or redirect
      alert('Schedule saved successfully!')
    } catch (error) {
      console.error('Error saving schedule:', error instanceof Error ? error.message : 'Unknown error')
      setSaveError('Failed to save schedule. Please try again.')
    } finally {
      setIsSaving(false)
    }
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

          <div className="mt-8">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {Object.entries(schedule).map(([turnus, entry]) => (
                      <th key={turnus} className="border p-2">
                        <div>{turnus}</div>
                        <div className="text-sm font-normal text-gray-500">{entry.weeks.length} weeks</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.values(schedule)[0]?.weeks?.map((_, weekIndex) => (
                    <tr key={weekIndex}>
                      {Object.values(schedule).map((entry, turnusIndex) => (
                        <td key={turnusIndex} className="border p-2">
                          {entry?.weeks?.[weekIndex] && (
                            <>
                              {entry.weeks[weekIndex].week}
                              <br />
                              <span className={entry.weeks[weekIndex].isHoliday ? 'text-red-500' : undefined}>
                                {entry.weeks[weekIndex].date}
                              </span>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    {Object.entries(schedule).map(([turnus, entry], turnusIndex) => {
                      return (
                        <td key={turnusIndex} className="border p-2 bg-gray-50">
                          {entry?.holidays?.length > 0 ? (
                            <div className="text-sm">
                              <div className="font-medium mb-1">Missed Holidays:</div>
                              {entry.holidays.map((holiday, index) => (
                                <div key={index} className="text-gray-600">
                                  {holiday.name} ({format(holiday.startDate, 'dd.MM.yy')})
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500">No missed holidays</div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-4">
            <Button variant="outline" onClick={() => window.history.back()}>
              Back
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Schedule'}
            </Button>
          </div>

          {saveError && (
            <div className="mt-4 text-red-500">
              {saveError}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 