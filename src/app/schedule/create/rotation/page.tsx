'use client'

import { useState, useEffect,  useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addWeeks, format, setDay,  isWithinInterval } from 'date-fns'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouter, useSearchParams } from 'next/navigation'
import { captureFrontendError } from '@/lib/frontend-error'

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

interface ScheduleResponse {
  id: number;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  selectedWeekday: number;
  scheduleData: unknown;
  additionalInfo?: string;
  className?: number;
  createdAt: string;
}

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' }
]

/**
 * React component for creating and editing a rotation schedule with configurable terms, custom week lengths, and holiday management.
 *
 * Users can specify the number of terms, select a rotation weekday, assign custom week lengths per term, and provide additional schedule information. The component automatically distributes weeks among terms, excludes holidays, and displays a summary table of the resulting schedule. Existing schedules can be loaded and edited if a class name is provided.
 *
 * @returns The UI for creating or editing a rotation schedule.
 */

export default function RotationPage() {
  const [schedule, setSchedule] = useState<Schedule>({})
  const [customLengths, setCustomLengths] = useState<Record<string, number>>({})
  const [numberOfTerms, setNumberOfTerms] = useState(4)
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [ ,setIsCustomLength] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [weekError] = useState<string | null>(null)
  const [startDate, ] = useState<Date>(new Date())
  const [endDate, ] = useState<Date>(new Date())
  const [additionalInfo, setAdditionalInfo] = useState<string>('')
  const [allSchedules, setAllSchedules] = useState<ScheduleResponse[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  const className = searchParams.get('class')
  const isManualChangeRef = useRef(false)
  const shouldUpdateScheduleRef = useRef(false)

  const schoolYearStart = new Date(2024, 8, 9) // September 1st
  const schoolYearEnd = new Date(2025, 5, 28) // June 30th

  // Handle input changes
  const handleNumberOfTermsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (value > 8) {
      setNumberOfTerms(8);
    } else {
      isManualChangeRef.current = true;
      shouldUpdateScheduleRef.current = true;
      setNumberOfTerms(value);
      setIsCustomLength(false);
    }
  };

  // Handle custom lengths cleanup
  useEffect(() => {
    if (!isLoading) {
      const newCustomLengths = { ...customLengths };
      let hasChanges = false;
      
      Object.keys(newCustomLengths).forEach(key => {
        const parts = key.split(' ');
        const termNumberStr = parts[1];
        if (parts.length === 2 && termNumberStr) {
          const termNumber = parseInt(termNumberStr);
          if (!isNaN(termNumber) && termNumber > numberOfTerms) {
            delete newCustomLengths[key];
            hasChanges = true;
          }
        }
      });

      if (hasChanges) {
        setCustomLengths(newCustomLengths);
        shouldUpdateScheduleRef.current = true;
      }
    }
  }, [numberOfTerms, isLoading, customLengths]);

  // Handle schedule updates
  useEffect(() => {
    if (isLoading || selectedWeekday === null || !shouldUpdateScheduleRef.current) return;

    // Calculate new schedule
    const newSchedule: Schedule = {};
    const allRotationDates = getAllRotationDates(schoolYearStart, schoolYearEnd, selectedWeekday);
    const totalWeeks = allRotationDates.length;
    let weeksLeft = totalWeeks;
    let turnsLeft = numberOfTerms;
    const weeksPerTerm: number[] = [];

    // Calculate weeks per term
    for (let i = 0; i < numberOfTerms; i++) {
      const turnusKey = `TURNUS ${i + 1}`;
      if (customLengths[turnusKey] && customLengths[turnusKey] > 0) {
        weeksPerTerm.push(customLengths[turnusKey]);
        weeksLeft -= customLengths[turnusKey];
        turnsLeft--;
      } else {
        weeksPerTerm.push(0);
      }
    }

    // Distribute remaining weeks
    for (let i = 0; i < numberOfTerms; i++) {
      if (weeksPerTerm[i] === 0 && turnsLeft > 0) {
        const base = Math.floor(weeksLeft / turnsLeft);
        const extra = weeksLeft % turnsLeft > 0 ? 1 : 0;
        weeksPerTerm[i] = base + extra;
        weeksLeft -= weeksPerTerm[i]!;
        turnsLeft--;
      }
    }

    // Generate schedule entries
    let rotationIndex = 0;
    for (let i = 0; i < numberOfTerms; i++) {
      const turnusKey = `TURNUS ${i + 1}`;
      const weeksForThisTerm = weeksPerTerm[i] ?? 0;
      const termDates = allRotationDates.slice(rotationIndex, rotationIndex + weeksForThisTerm);
      rotationIndex += weeksForThisTerm;

      const weeksWithHolidays = termDates.map((date) => ({
        week: `KW${getWeekNumber(date)}`,
        date: format(date, 'dd.MM.yy'),
        isHoliday: isHoliday(date),
        originalDate: date
      }));

      const firstWeek = weeksWithHolidays[0];
      const lastWeek = weeksWithHolidays[weeksWithHolidays.length - 1];
      const turnDateRange = {
        start: firstWeek?.originalDate ?? new Date(),
        end: lastWeek?.originalDate ?? new Date()
      };

      const turnHolidays = holidays.filter(holiday => {
        if (!turnDateRange.start || !turnDateRange.end) return false;
        const holidayStart = new Date(holiday.startDate);
        const holidayEnd = new Date(holiday.endDate);
        return isWithinInterval(holidayStart, {
          start: turnDateRange.start,
          end: turnDateRange.end
        }) || isWithinInterval(holidayEnd, {
          start: turnDateRange.start,
          end: turnDateRange.end
        }) || isWithinInterval(turnDateRange.start, {
          start: holidayStart,
          end: holidayEnd
        });
      });

      newSchedule[turnusKey] = {
        name: turnusKey,
        weeks: weeksWithHolidays
          .filter(week => !week.isHoliday)
          .map(({ week, date }) => ({ week, date, isHoliday: false })),
        holidays: turnHolidays
      };
    }

    setSchedule(newSchedule);
    isManualChangeRef.current = false;
    shouldUpdateScheduleRef.current = false;
  }, [numberOfTerms, selectedWeekday, isLoading, holidays, schoolYearStart, schoolYearEnd, customLengths]);

  // Handle weekday changes
  useEffect(() => {
    if (!isLoading && allSchedules.length > 0 && selectedWeekday !== null && !isManualChangeRef.current) {
      const scheduleForWeekday = allSchedules.find(s => s.selectedWeekday === selectedWeekday)
      if (scheduleForWeekday) {
        setSchedule((scheduleForWeekday.scheduleData as Schedule) ?? {})
        setNumberOfTerms(Object.keys((scheduleForWeekday.scheduleData as Schedule) ?? {}).length)
        setAdditionalInfo(scheduleForWeekday.additionalInfo ?? '')
        setIsCustomLength(false)
      }
    }
  }, [selectedWeekday, allSchedules, isLoading])

  // Load initial data and schedules
  useEffect(() => {
    const loadInitialData = async () => {
      await fetchHolidays()
      if (className) {
        await fetchExistingSchedule(className)
      }
    }
    void loadInitialData()
  }, [className])

  const fetchExistingSchedule = async (className: string) => {
    try {
      setIsLoading(true)
      
      // First, get the numeric class ID from the class name
      const classResponse = await fetch(`/api/classes/get-by-name?name=${className}`)
      if (!classResponse.ok) {
        throw new Error('Failed to fetch class information')
      }
      const classData = await classResponse.json()
      if (!classData?.id) {
        throw new Error('Class not found')
      }

      const response = await fetch(`/api/schedules?classId=${className}`)
      if (!response.ok) {
        // Handle missing schedule gracefully
        setSelectedWeekday(1)
        setNumberOfTerms(4)
        setAdditionalInfo('')
        shouldUpdateScheduleRef.current = true
        return
      }
      
      const schedules = await response.json() as ScheduleResponse[]
      
      if (schedules && schedules.length > 0) {
        setAllSchedules(schedules)
        
        // Get the latest schedule by creation date
        const latestSchedule = schedules.reduce((latest, current) => {
          if (!latest) return current
          const latestDate = new Date(latest.createdAt).getTime()
          const currentDate = new Date(current.createdAt).getTime()
          return currentDate > latestDate ? current : latest
        }, schedules[0])
        
        if (latestSchedule) {
          // Set the weekday from the latest schedule
          console.log("Latest schedule: ", latestSchedule)
          setSelectedWeekday(latestSchedule.selectedWeekday)
          
          // Find the schedule for the selected weekday
          const currentSchedule = schedules.find(s => s.selectedWeekday === latestSchedule.selectedWeekday)
          if (currentSchedule) {
            // Populate state from loaded schedule
            setSchedule((currentSchedule.scheduleData as Schedule) ?? {})
            setNumberOfTerms(Object.keys((currentSchedule.scheduleData as Schedule) ?? {}).length)
            setAdditionalInfo(currentSchedule.additionalInfo ?? '')
          }
        }
      } else {
        // Set default values when no schedules exist
        setSelectedWeekday(1)
        setNumberOfTerms(4)
        setAdditionalInfo('')
        shouldUpdateScheduleRef.current = true
      }
    } catch (err) {
      // Only log errors for class information fetch failures
      if (err instanceof Error && err.message === 'Failed to fetch class information') {
        console.error('Error fetching class information:', err)
        captureFrontendError(err, {
          location: 'schedule/create/rotation',
          type: 'fetch-schedule',
          extra: {
            className,
            selectedWeekday
          }
        })
      }
      // Set default values on error
      setSelectedWeekday(1)
      setNumberOfTerms(4)
      setAdditionalInfo('')
      shouldUpdateScheduleRef.current = true
    } finally {
      setIsLoading(false)
    }
  }

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
    } catch (err) {
      console.error('Error fetching holidays:', err)
      captureFrontendError(err, {
        location: 'schedule/create/rotation',
        type: 'fetch-holidays'
      })
      setFetchError('Failed to load holidays.')
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
      

      
      return isHoliday
    })
  }

  /**
   * Returns all dates within the specified range that fall on the given weekday and are not holidays.
   *
   * @param start - The start date of the range.
   * @param end - The end date of the range.
   * @param weekday - The target weekday (0 for Sunday, 1 for Monday, etc.).
   * @returns An array of dates matching the specified weekday and excluding holidays.
   */
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
      const classResponse = await fetch(`/api/classes/get-by-name?name=${className}`)
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
          description: `Rotation schedule for class ${className}`,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          selectedWeekday,
          scheduleData: schedule,
          additionalInfo,
          classId: classData.id.toString()
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to save schedule')
      }

      // Navigate to the times page with the class parameter
      router.push(`/schedule/create/times?class=${className}`)
    } catch (err) {
      console.error('Error saving schedule:', err)
      captureFrontendError(err, {
        location: 'schedule/create/rotation',
        type: 'save-schedule',
        extra: {
          className,
          schedule,
          numberOfTerms,
          selectedWeekday,
          additionalInfo
        }
      })
      setSaveError('Failed to save schedule.')
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
          <div className="flex gap-8 mb-4">
            <div>
              <Label htmlFor="numberOfTerms">Number of Terms</Label>
              <Input
                id="numberOfTerms"
                type="number"
                value={numberOfTerms}
                onChange={handleNumberOfTermsChange}
                min={1}
                max={8}
                className="w-32"
              />
            </div>
            <div>
              <Label htmlFor="weekday">Rotation Day</Label>
              <Select
                value={selectedWeekday?.toString() ?? ''}
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
            <Label htmlFor="additionalInfo">Additional Information</Label>
            <Input
              id="additionalInfo"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              placeholder="Enter any additional information about this schedule"
              className="w-full"
            />
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
                      onChange={(e) => {
                        setIsCustomLength(true)
                        shouldUpdateScheduleRef.current = true
                        if (isNaN(parseInt(e.target.value)) || parseInt(e.target.value) <= 0) {
                          setCustomLengths(prev => {
                            const newLengths = { ...prev }
                            delete newLengths[turnusKey]
                            return newLengths
                          })
                        } else {
                          setCustomLengths(prev => ({
                            ...prev,
                            [turnusKey]: parseInt(e.target.value)
                          }))
                        }
                      }}
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