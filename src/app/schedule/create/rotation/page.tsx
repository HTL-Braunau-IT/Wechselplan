'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addWeeks, format, setDay, getDay, isWithinInterval } from 'date-fns'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouter, useSearchParams } from 'next/navigation'

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
  name: string
  weeks: WeekInfo[]
  holidays: Holiday[]
  customLength?: number
}

type Schedule = Record<string, ScheduleEntry>

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' }
]



// Helper: generate all rotation dates (e.g., all Mondays) between start and end

export default function RotationPage() {
  const [schedule, setSchedule] = useState<Schedule>({})
  const [customLengths, setCustomLengths] = useState<Record<string, number>>({})
  const [numberOfTerms, setNumberOfTerms] = useState(4)
  const [selectedWeekday, setSelectedWeekday] = useState(1)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isCustomLehgth, setIsCustomLehgth] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [weekError, setWeekError] = useState<string | null>(null)
  const [loadedFromDb, setLoadedFromDb] = useState(false)
  const [startDate, ] = useState<Date>(new Date())
  const [endDate, ] = useState<Date>(new Date())
  const router = useRouter()
  const searchParams = useSearchParams()
  const classId = searchParams.get('class')

  const schoolYearStart = new Date(2024, 8, 9) // September 1st
  const schoolYearEnd = new Date(2025, 5, 28) // June 30th

  useEffect(() => {
    void fetchHolidays()
  }, [])

  // Only load from DB once if classId is present
  useEffect(() => {
    if (classId && !loadedFromDb) {
      void fetchExistingSchedule(classId);
    }

  }, [classId, loadedFromDb]);

  // Only recalculate if not loaded from DB
  useEffect(() => {
    if (!isLoading && !loadedFromDb) {
      calculateSchedule();
    }
  }, [numberOfTerms, selectedWeekday, holidays, isLoading, loadedFromDb]);

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
    } catch {
         setFetchError('Failed to load holidays.')

    } finally {
      setIsLoading(false)
    }
  }

  const fetchExistingSchedule = async (classId: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/schedules?classId=${classId}&weekday=${selectedWeekday}`);
      if (!response.ok) throw new Error('Failed to fetch schedule');
      const schedules = await response.json();
      if (process.env.NODE_ENV !== 'production') {
        console.log('Schedules:', schedules);
      }
      if (schedules && schedules.length > 0) {
        const latest = schedules[0];
        // Populate state from loaded schedule
        setSchedule((latest.scheduleData as Schedule) ?? {});
        setNumberOfTerms(Object.keys((latest.scheduleData as Schedule) ?? {}).length);
        setSelectedWeekday((latest.selectedWeekday as number) ?? 1);

        setLoadedFromDb(true);
      } else {
        setLoadedFromDb(false);
        calculateSchedule();
      }
    } catch {
      setLoadedFromDb(false);
      calculateSchedule();
    } finally {
      setIsLoading(false);
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

  function getAllRotationDates(start: Date, end: Date, weekday: number): Date[] {
    const dates: Date[] = [];
    let date: Date | undefined = setDay(new Date(start), weekday);
    if (date < start) date = addWeeks(date, 1);
    while (date && date <= end) {
      if (!isHoliday(date)) {
        dates.push(new Date(date));
      }
      date = addWeeks(date, 1);
    }
    
    return dates;
  }
  

  const calculateSchedule = () => {
    if ((isCustomLehgth && loadedFromDb) || !loadedFromDb) {
      const newSchedule: Schedule = {}
      // Generate all rotation dates for the year
      const allRotationDates = getAllRotationDates(schoolYearStart, schoolYearEnd, selectedWeekday);
      const totalWeeks = allRotationDates.length;
      let weeksLeft = totalWeeks;
      let turnsLeft = numberOfTerms;
      // Calculate how many weeks each term should get
      const weeksPerTerm: number[] = [];

      for (let i = 0; i < numberOfTerms; i++) {
        const turnusKey = `TURNUS ${i + 1}`;
        if (customLengths[turnusKey] && customLengths[turnusKey] > 0) {
          weeksPerTerm.push(customLengths[turnusKey]);
          weeksLeft -= customLengths[turnusKey];
          turnsLeft--;

        } else {
          weeksPerTerm.push(0); // placeholder, will fill in next
        }
      }
      // Distribute remaining weeks evenly
      for (let i = 0; i < numberOfTerms; i++) {
        if (weeksPerTerm[i] === 0 && turnsLeft > 0) {
          const base = Math.floor(weeksLeft / turnsLeft);
          const extra = weeksLeft % turnsLeft > 0 ? 1 : 0;
          weeksPerTerm[i] = base + extra;
          weeksLeft -= weeksPerTerm[i]!;
          turnsLeft--;
        }
      }
      let rotationIndex2 = 0;
      for (let i = 0; i < numberOfTerms; i++) {
        const turnusKey = `TURNUS ${i + 1}`;
        const weeksForThisTerm = weeksPerTerm[i] ?? 0;
        const termDates = allRotationDates.slice(rotationIndex2, rotationIndex2 + weeksForThisTerm);
        rotationIndex2 += weeksForThisTerm;
        const weeksWithHolidays = termDates.map((date) => {
          const isHolidayDate = isHoliday(date);
          return {
            week: `KW${getWeekNumber(date)}`,
            date: format(date, 'dd.MM.yy'),
            isHoliday: isHolidayDate,
            originalDate: date
          };
        });
        const firstWeek = weeksWithHolidays.length > 0 ? weeksWithHolidays[0] : undefined;
        const lastWeek = weeksWithHolidays.length > 0 ? weeksWithHolidays[weeksWithHolidays.length - 1] : undefined;
        const turnDateRange = {
          start: firstWeek && firstWeek.originalDate instanceof Date ? firstWeek.originalDate : new Date(),
          end: lastWeek && lastWeek.originalDate instanceof Date ? lastWeek.originalDate : new Date()
        };
        const turnHolidays = holidays.filter(holiday => {
          if (!turnDateRange.start || !turnDateRange.end) return false;
          const holidayStart = holiday.startDate instanceof Date
            ? new Date(holiday.startDate.getFullYear(), holiday.startDate.getMonth(), holiday.startDate.getDate())
            : new Date();
          const holidayEnd = holiday.endDate instanceof Date
            ? new Date(holiday.endDate.getFullYear(), holiday.endDate.getMonth(), holiday.endDate.getDate())
            : new Date();
          const isInDateRange = isWithinInterval(holidayStart, {
            start: turnDateRange.start,
            end: turnDateRange.end
          }) ?? isWithinInterval(holidayEnd, {
            start: turnDateRange.start,
            end: turnDateRange.end
          }) ?? isWithinInterval(turnDateRange.start, {
            start: holidayStart,
            end: holidayEnd
          });
          if (!isInDateRange) return false;
          const holidayStartDay = getDay(holidayStart);
          const holidayEndDay = getDay(holidayEnd);
          if (holidayStartDay !== holidayEndDay) {
            return true;
          }
          return holidayStartDay === selectedWeekday;
        });
        newSchedule[turnusKey] = {
          name: turnusKey,
          weeks: weeksWithHolidays
            .filter(week => !week.isHoliday)
            .map(({ week, date }) => ({ week, date, isHoliday: false })),
          holidays: turnHolidays
        };
      }
      // Boundary check: warn if too few or too many weeks assigned (count all assigned weeks)
      const assignedTotal = weeksPerTerm.reduce((a, b) => a + b, 0);
      if (assignedTotal < totalWeeks) {
        setWeekError(`Total assigned weeks (${assignedTotal}) is less than available weeks (${totalWeeks}). Please assign all weeks.`);
      } else if (assignedTotal > totalWeeks) {
        setWeekError(`Total assigned weeks (${assignedTotal}) is greater than available weeks (${totalWeeks}). Please reduce the assigned weeks.`);
      } else {
        setWeekError(null);
      }
      setSchedule(newSchedule);
    }
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

      // First, get the numeric class ID from the class name
      const classResponse = await fetch(`/api/classes/get-by-name?name=${classId}`)
      if (!classResponse.ok) {
        throw new Error('Failed to fetch class information')
      }
      const classData = await classResponse.json()
      if (!classData?.id) {
        throw new Error('Class not found')
      }

      const firstSchedule = Object.values(schedule)[0]
      console.log("Schedule: ", firstSchedule?.name)

      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Rotation Schedule',
          description: `Rotation schedule for class ${classId}`,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          selectedWeekday,
          schedule,
          classId: classData.id
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save schedule')
      }

      // Navigate to the times page with the class parameter
      router.push(`/schedule/create/times?class=${classId}`)
    } catch (error) {
      console.error('Error saving schedule:', error instanceof Error ? error.message : 'Unknown error')
      setSaveError('Failed to save schedule. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCustomLengthChange = (turnusKey: string, length: number) => {
    setIsCustomLehgth(true)
    if (isNaN(length) || length <= 0) {
      setCustomLengths(prev => {
        const newLengths = { ...prev }
        delete newLengths[turnusKey]
        return newLengths
      })
    } else {
      setCustomLengths(prev => ({
        ...prev,
        [turnusKey]: length
      }))
    }
  }

  // Recalculate when custom lengths change
  useEffect(() => {
    if (!isLoading) {
      calculateSchedule()
    }
  }, [isLoading, numberOfTerms, selectedWeekday, holidays, customLengths])

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Rotation Periods</CardTitle>
        </CardHeader>
        <CardContent>
          {fetchError && (
            <div className="mb-4 p-4 text-red-500 bg-red-50 rounded-md">
              {fetchError}
            </div>
          )}
          {weekError && (
            <div className="mb-4 p-4 text-red-500 bg-red-50 rounded-md">
              {weekError}
            </div>
          )}
          {loadedFromDb && (
            <div className="mb-4 text-green-500">Loaded existing schedule from database.</div>
          )}
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

          <div className="mb-4">
            <Label>Custom Lengths</Label>
            <div className="flex gap-4 mt-2">
              {Array.from({ length: numberOfTerms }).map((_, index) => {
                const turnusKey = `TURNUS ${index + 1}`
                const currentWeeks = schedule[turnusKey]?.weeks.length ?? 0
                return (
                  <div key={turnusKey} className="flex items-center gap-2">
                    <Label className="text-sm">{turnusKey}</Label>
                    <Input
                      type="number"
                      value={customLengths[turnusKey] ?? ''}
                      onChange={(e) => handleCustomLengthChange(turnusKey, parseInt(e.target.value))}
                      className="w-20 h-8"
                      min={1}
                      placeholder={`${currentWeeks} weeks`}
                    />
                  </div>
                )
              })}
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
                        <div className="text-sm font-normal text-muted-foreground">
                          {entry.weeks.length} weeks
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.max(...Object.values(schedule).map(entry => entry.weeks.length)) }).map((_, weekIndex) => (
                    <tr key={weekIndex}>
                      {Object.values(schedule).map((entry, turnusIndex) => (
                        <td key={turnusIndex} className="border p-2">
                          {entry?.weeks?.[weekIndex] && (
                            <>
                              {entry.weeks[weekIndex].week}
                              <br />
                              <span className={entry.weeks[weekIndex].isHoliday ? 'text-destructive' : undefined}>
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
                    {Object.entries(schedule).map(([, entry], turnusIndex) => {
                      return (
                        <td key={turnusIndex} className="border p-2 bg-muted">
                          {entry?.holidays?.length > 0 ? (
                            <div className="text-sm">
                              <div className="font-medium mb-1">Missed Holidays:</div>
                              {entry.holidays.map((holiday, index) => (
                                <div key={index} className="text-muted-foreground">
                                  {holiday.name} ({format(holiday.startDate, 'dd.MM.yy')})
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">No missed holidays</div>
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