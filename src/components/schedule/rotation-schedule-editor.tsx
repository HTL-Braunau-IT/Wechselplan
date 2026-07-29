'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addWeeks, format, setDay, isWithinInterval } from 'date-fns'
import { useTranslation } from 'next-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle, ArrowLeft, Save } from 'lucide-react'
import { captureFrontendError } from '@/lib/frontend-error'
import { WizardFooter } from '@/components/schedule/wizard-footer'

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

export type Schedule = Record<string, ScheduleEntry>

interface ScheduleResponse {
  id: number
  name: string
  description?: string
  startDate: string
  endDate: string
  selectedWeekday: number
  scheduleData: unknown
  additionalInfo?: string
  semesterPlanning?: string
  className?: number
  createdAt: string
}

// Fallback school-year bounds, used only when the selected school year is not
// supplied (e.g. no year configured). The real dates come from props.
const DEFAULT_SCHOOL_YEAR_START = new Date(2025, 8, 8)
const DEFAULT_SCHOOL_YEAR_END = new Date(2026, 6, 10)
const DEFAULT_SCHOOL_YEAR_MIDDLE = new Date(2026, 1, 15)

interface RotationScheduleEditorProps {
  className: string | null
  initialWeekday?: number | null
  /** Start of the selected school year (rotation dates are computed within these bounds). */
  schoolYearStart?: Date | null
  /** End of the selected school year. */
  schoolYearEnd?: Date | null
  /** Semester change date of the selected school year (splits first/second semester planning). */
  schoolYearMiddle?: Date | null
  onSave: (
    schedule: Schedule,
    selectedWeekday: number,
    additionalInfo: string,
    semesterPlanning: 'first' | 'second' | null,
  ) => Promise<void>
  onCancel?: () => void
}

/**
 * Component for creating and editing a rotation schedule with configurable terms, custom week lengths, and holiday management.
 *
 * Users can specify the number of terms, select a rotation weekday, assign custom week lengths per term, and provide additional schedule information. The component automatically distributes weeks among terms, excludes holidays, and displays a summary table of the resulting schedule.
 */
export function RotationScheduleEditor({
  className,
  initialWeekday,
  schoolYearStart: schoolYearStartProp,
  schoolYearEnd: schoolYearEndProp,
  schoolYearMiddle: schoolYearMiddleProp,
  onSave,
  onCancel,
}: RotationScheduleEditorProps) {
  const { t } = useTranslation('schedule')
  const isManualChangeRef = useRef(false)
  const shouldUpdateScheduleRef = useRef(false)

  const [schedule, setSchedule] = useState<Schedule>({})
  const [customLengths, setCustomLengths] = useState<Record<string, number>>({})
  const [numberOfTerms, setNumberOfTerms] = useState(4)
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(initialWeekday ?? 1)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [, setIsCustomLength] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [weekError] = useState<string | null>(null)
  const [additionalInfo, setAdditionalInfo] = useState<string>('')
  const [allSchedules, setAllSchedules] = useState<ScheduleResponse[]>([])
  const [onlyFirstSemester, setOnlyFirstSemester] = useState<boolean>(false)
  const [onlySecondSemester, setOnlySecondSemester] = useState<boolean>(false)

  // Derive stable Date identities from the selected school year (falling back to
  // sensible defaults). Memoized on the numeric timestamp so a parent re-render
  // that passes freshly-constructed Date objects does not retrigger effects.
  const startTime = schoolYearStartProp?.getTime() ?? DEFAULT_SCHOOL_YEAR_START.getTime()
  const endTime = schoolYearEndProp?.getTime() ?? DEFAULT_SCHOOL_YEAR_END.getTime()
  const middleTime = schoolYearMiddleProp?.getTime() ?? DEFAULT_SCHOOL_YEAR_MIDDLE.getTime()
  const schoolYearStart = useMemo(() => new Date(startTime), [startTime])
  const schoolYearEnd = useMemo(() => new Date(endTime), [endTime])
  const schoolYearMiddle = useMemo(() => new Date(middleTime), [middleTime])

  // Handle input changes
  const handleNumberOfTermsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value)
    if (value > 8) {
      setNumberOfTerms(8)
    } else {
      isManualChangeRef.current = true
      shouldUpdateScheduleRef.current = true
      setNumberOfTerms(value)
      setIsCustomLength(false)
    }
  }

  // Handle custom lengths cleanup
  useEffect(() => {
    if (!isLoading) {
      const newCustomLengths = { ...customLengths }
      let hasChanges = false

      Object.keys(newCustomLengths).forEach(key => {
        const parts = key.split(' ')
        const termNumberStr = parts[1]
        if (parts.length === 2 && termNumberStr) {
          const termNumber = parseInt(termNumberStr)
          if (!isNaN(termNumber) && termNumber > numberOfTerms) {
            delete newCustomLengths[key]
            hasChanges = true
          }
        }
      })

      if (hasChanges) {
        setCustomLengths(newCustomLengths)
        shouldUpdateScheduleRef.current = true
      }
    }
  }, [numberOfTerms, isLoading, customLengths])

  // Handle schedule updates
  useEffect(() => {
    if (isLoading || selectedWeekday === null || !shouldUpdateScheduleRef.current) return

    // Calculate new schedule
    const newSchedule: Schedule = {}
    const startDateForCalculation = onlySecondSemester ? schoolYearMiddle : schoolYearStart
    const endDateForCalculation = onlyFirstSemester ? schoolYearMiddle : schoolYearEnd
    const allRotationDates = getAllRotationDates(
      startDateForCalculation,
      endDateForCalculation,
      selectedWeekday,
    )
    const totalWeeks = allRotationDates.length
    let weeksLeft = totalWeeks
    let turnsLeft = numberOfTerms
    const weeksPerTerm: number[] = []

    // Calculate weeks per term
    for (let i = 0; i < numberOfTerms; i++) {
      const turnusKey = `TURNUS ${i + 1}`
      if (customLengths[turnusKey] && customLengths[turnusKey] > 0) {
        weeksPerTerm.push(customLengths[turnusKey])
        weeksLeft -= customLengths[turnusKey]
        turnsLeft--
      } else {
        weeksPerTerm.push(0)
      }
    }

    // Distribute remaining weeks
    for (let i = 0; i < numberOfTerms; i++) {
      if (weeksPerTerm[i] === 0 && turnsLeft > 0) {
        const base = Math.floor(weeksLeft / turnsLeft)
        const extra = weeksLeft % turnsLeft > 0 ? 1 : 0
        weeksPerTerm[i] = base + extra
        weeksLeft -= weeksPerTerm[i]!
        turnsLeft--
      }
    }

    // Generate schedule entries
    let rotationIndex = 0
    for (let i = 0; i < numberOfTerms; i++) {
      const turnusKey = `TURNUS ${i + 1}`
      const weeksForThisTerm = weeksPerTerm[i] ?? 0
      const termDates = allRotationDates.slice(rotationIndex, rotationIndex + weeksForThisTerm)
      rotationIndex += weeksForThisTerm

      const weeksWithHolidays = termDates.map(date => ({
        week: `KW${getWeekNumber(date)}`,
        date: format(date, 'dd.MM.yy'),
        isHoliday: isHoliday(date),
        originalDate: date,
      }))

      const firstWeek = weeksWithHolidays[0]
      const lastWeek = weeksWithHolidays[weeksWithHolidays.length - 1]
      const turnDateRange = {
        start: firstWeek?.originalDate ?? new Date(),
        end: lastWeek?.originalDate ?? new Date(),
      }

      const turnHolidays = holidays.filter(holiday => {
        if (!turnDateRange.start || !turnDateRange.end) return false
        const holidayStart = new Date(holiday.startDate)
        const holidayEnd = new Date(holiday.endDate)
        return (
          isWithinInterval(holidayStart, {
            start: turnDateRange.start,
            end: turnDateRange.end,
          }) ||
          isWithinInterval(holidayEnd, {
            start: turnDateRange.start,
            end: turnDateRange.end,
          }) ||
          isWithinInterval(turnDateRange.start, {
            start: holidayStart,
            end: holidayEnd,
          })
        )
      })

      newSchedule[turnusKey] = {
        name: turnusKey,
        weeks: weeksWithHolidays
          .filter(week => !week.isHoliday)
          .map(({ week, date }) => ({ week, date, isHoliday: false })),
        holidays: turnHolidays,
      }
    }

    setSchedule(newSchedule)
    isManualChangeRef.current = false
    shouldUpdateScheduleRef.current = false
  }, [
    numberOfTerms,
    selectedWeekday,
    isLoading,
    holidays,
    schoolYearStart,
    schoolYearEnd,
    customLengths,
    onlyFirstSemester,
    onlySecondSemester,
    schoolYearMiddle,
  ])

  // Handle weekday changes
  useEffect(() => {
    if (
      !isLoading &&
      allSchedules.length > 0 &&
      selectedWeekday !== null &&
      !isManualChangeRef.current
    ) {
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

  // Update effect to handle weekday changes
  useEffect(() => {
    if (!isLoading && selectedWeekday !== null) {
      shouldUpdateScheduleRef.current = true
    }
  }, [selectedWeekday, isLoading])

  // Update effect to handle initial load with weekday parameter
  useEffect(() => {
    if (initialWeekday && !isLoading && !selectedWeekday) {
      const weekday = initialWeekday
      if (!isNaN(weekday) && weekday >= 1 && weekday <= 5) {
        setSelectedWeekday(weekday)
        shouldUpdateScheduleRef.current = true
      }
    }
  }, [initialWeekday, isLoading, selectedWeekday])

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
        setSelectedWeekday(initialWeekday ?? 1)
        setNumberOfTerms(4)
        setAdditionalInfo('')
        shouldUpdateScheduleRef.current = true
        return
      }

      const schedules = (await response.json()) as ScheduleResponse[]

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
          // If we have a weekday parameter, use it instead of the stored weekday
          const weekdayToUse = initialWeekday ?? latestSchedule.selectedWeekday
          setSelectedWeekday(weekdayToUse)

          // Find the schedule for the selected weekday
          const currentSchedule = schedules.find(s => s.selectedWeekday === weekdayToUse)
          if (currentSchedule) {
            // Populate state from loaded schedule
            setSchedule((currentSchedule.scheduleData as Schedule) ?? {})
            setNumberOfTerms(Object.keys((currentSchedule.scheduleData as Schedule) ?? {}).length)
            setAdditionalInfo(currentSchedule.additionalInfo ?? '')

            // Set semester planning state based on loaded data
            if (currentSchedule.semesterPlanning === 'first') {
              setOnlyFirstSemester(true)
              setOnlySecondSemester(false)
            } else if (currentSchedule.semesterPlanning === 'second') {
              setOnlyFirstSemester(false)
              setOnlySecondSemester(true)
            } else {
              setOnlyFirstSemester(false)
              setOnlySecondSemester(false)
            }
          } else {
            // If no schedule exists for this weekday, trigger a new schedule creation
            shouldUpdateScheduleRef.current = true
          }
        }
      } else {
        // Set default values when no schedules exist
        setSelectedWeekday(initialWeekday ?? 1)
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
            selectedWeekday,
          },
        })
      }
      // Set default values on error
      setSelectedWeekday(initialWeekday ?? 1)
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
      const data = (await response.json()) as Holiday[]
      setHolidays(
        data.map(holiday => ({
          ...holiday,
          startDate: new Date(holiday.startDate),
          endDate: new Date(holiday.endDate),
        })),
      )
    } catch (err) {
      console.error('Error fetching holidays:', err)
      captureFrontendError(err, {
        location: 'schedule/create/rotation',
        type: 'fetch-holidays',
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
      const holidayStart = new Date(
        holiday.startDate.getFullYear(),
        holiday.startDate.getMonth(),
        holiday.startDate.getDate(),
      )
      const holidayEnd = new Date(
        holiday.endDate.getFullYear(),
        holiday.endDate.getMonth(),
        holiday.endDate.getDate(),
      )

      const isHoliday = isWithinInterval(checkDate, {
        start: holidayStart,
        end: holidayEnd,
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
    const dates: Date[] = []
    let date: Date | undefined = setDay(new Date(start), weekday)
    if (date < start) date = addWeeks(date, 1)

    while (date && date <= end) {
      if (!isHoliday(date)) {
        dates.push(new Date(date))
      }
      const nextDate: Date = addWeeks(date, 1)
      // Check if the next date would exceed the end date before adding it
      if (nextDate > end) {
        break
      }
      date = nextDate
    }

    return dates
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

      const semesterPlanning = onlyFirstSemester ? 'first' : onlySecondSemester ? 'second' : null
      await onSave(schedule, selectedWeekday ?? 1, additionalInfo, semesterPlanning)
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
          additionalInfo,
        },
      })
      setSaveError('Failed to save schedule.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading)
    return (
      <div className="flex min-h-[200px] items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('rotationPeriods')}</CardTitle>
      </CardHeader>
      <CardContent>
        {fetchError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t('failedToLoadHolidays')}</AlertDescription>
          </Alert>
        )}
        {weekError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{weekError}</AlertDescription>
          </Alert>
        )}
        <div className="mb-4 flex flex-wrap gap-8">
          <div>
            <Label htmlFor="numberOfTerms">{t('numberOfTerms')}</Label>
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
            <Label>{t('rotationDay')}</Label>
            {/* The rotation day is chosen on the teacher step (it is stored with the
                teacher assignments); shown here read-only so the two never diverge. */}
            <p className="mt-2 text-sm font-medium">
              {selectedWeekday ? t(`weekdays.${selectedWeekday}`) : '—'}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <Label htmlFor="additionalInfo">{t('additionalInformation')}</Label>
          <Input
            id="additionalInfo"
            value={additionalInfo}
            onChange={e => setAdditionalInfo(e.target.value)}
            placeholder={t('additionalInfoPlaceholder')}
            className="w-full"
          />
        </div>

        <div className="mb-4">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('semesterPlanningTitle')}</h3>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant={onlyFirstSemester ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setOnlyFirstSemester(!onlyFirstSemester)
                  if (!onlyFirstSemester) setOnlySecondSemester(false)
                  shouldUpdateScheduleRef.current = true
                }}
              >
                {t('planFirstSemester')}
              </Button>
              <Button
                type="button"
                variant={onlySecondSemester ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setOnlySecondSemester(!onlySecondSemester)
                  if (!onlySecondSemester) setOnlyFirstSemester(false)
                  shouldUpdateScheduleRef.current = true
                }}
              >
                {t('planSecondSemester')}
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">
              {onlyFirstSemester
                ? t('rotationUntil', { date: format(schoolYearMiddle, 'dd.MM.yyyy') })
                : onlySecondSemester
                  ? t('rotationFromUntil', {
                      start: format(schoolYearMiddle, 'dd.MM.yyyy'),
                      end: format(schoolYearEnd, 'dd.MM.yyyy'),
                    })
                  : t('rotationWholeYear')}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <Label>{t('customLengths')}</Label>
          <div className="mt-2 flex flex-wrap gap-4">
            {Array.from({ length: numberOfTerms }).map((_, index) => {
              const turnusKey = `TURNUS ${index + 1}`
              const currentWeeks = schedule[turnusKey]?.weeks.length ?? 0
              return (
                <div key={turnusKey} className="flex items-center gap-2">
                  <Label className="text-sm">{turnusKey}</Label>
                  <Input
                    type="number"
                    value={customLengths[turnusKey] ?? ''}
                    onChange={e => {
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
                          [turnusKey]: parseInt(e.target.value),
                        }))
                      }
                    }}
                    className="h-8 w-20"
                    min={1}
                    placeholder={`${currentWeeks} ${t('weeks')}`}
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
                      <div className="text-muted-foreground text-sm font-normal">
                        {entry.weeks.length} {t('weeks')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({
                  length: Math.max(...Object.values(schedule).map(entry => entry.weeks.length)),
                }).map((_, weekIndex) => (
                  <tr key={weekIndex}>
                    {Object.values(schedule).map((entry, turnusIndex) => (
                      <td key={turnusIndex} className="border p-2">
                        {entry?.weeks?.[weekIndex] && (
                          <>
                            {entry.weeks[weekIndex].week}
                            <br />
                            <span
                              className={
                                entry.weeks[weekIndex].isHoliday ? 'text-destructive' : undefined
                              }
                            >
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
                      <td key={turnusIndex} className="bg-muted border p-2">
                        {entry?.holidays?.length > 0 ? (
                          <div className="text-sm">
                            <div className="mb-1 font-medium">{t('missedHolidays')}</div>
                            {entry.holidays.map((holiday, index) => (
                              <div key={index} className="text-muted-foreground">
                                {holiday.name} ({format(holiday.startDate, 'dd.MM.yy')})
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-muted-foreground text-sm">
                            {t('noMissedHolidays')}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <WizardFooter
          back={
            onCancel && (
              <Button variant="outline" onClick={onCancel}>
                <ArrowLeft className="h-4 w-4" />
                {t('back')}
              </Button>
            )
          }
        >
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
            {isSaving ? t('saving') : t('saveSchedule')}
          </Button>
        </WizardFooter>

        {saveError && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t('failedToSaveSchedule')}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
