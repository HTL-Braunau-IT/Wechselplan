'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useSchoolYear } from '@/contexts/school-year-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCachedData } from '@/hooks/use-cached-data'
import { useScheduleOverview } from '@/hooks/use-schedule-overview'
import { ScheduleOverview } from '@/components/schedule-overview'
import { CheckCircle2, XCircle, ChevronDown } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { generateExcel, generatePdf, generateSchedulePDF } from '@/lib/export-utils'
import { parseJsonSafe, unwrapData } from '@/lib/api-client'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ScheduleExportActions } from '@/components/schedule/schedule-export-actions'
import { ScheduleMissingStateCard } from '@/components/schedule/schedule-missing-state-card'

interface Schedule {
  id: number
  name: string
  description: string | null
  startDate: string
  endDate: string
  selectedWeekday: number
  classId: number | null
  createdAt: string
  updatedAt: string
  additionalInfo: string | null
}

interface Class {
  id: number
  name: string
}

interface TeacherAssignmentResponse {
  groupId: number
  teacherId: number
  subject: string
  learningContent: string
  room: string
  teacherFirstName: string
  teacherLastName: string
}

interface TeacherAssignmentsResponse {
  amAssignments: TeacherAssignmentResponse[]
  pmAssignments: TeacherAssignmentResponse[]
}

/**
 * Displays the schedule overview for a given class, handling loading and error states.
 *
 * Renders a loading spinner while fetching data, an error message if no schedule is found, or the schedule overview when data is available.
 *
 * @param className - The name of the class for which to display the schedule overview.
 */
function ClassScheduleOverview({
  className,
  schoolYearId,
  weekdayOverride,
  showWeekdayControl = true,
}: {
  className: string
  schoolYearId: number | undefined
  weekdayOverride?: number | null
  showWeekdayControl?: boolean
}) {
  const [availableWeekdays, setAvailableWeekdays] = useState<number[]>([])
  const [localWeekdayOverride, setLocalWeekdayOverride] = useState<number | null>(weekdayOverride ?? null)
  const weekdayLabels: Record<number, string> = {
    1: 'Montag',
    2: 'Dienstag',
    3: 'Mittwoch',
    4: 'Donnerstag',
    5: 'Freitag',
  }

  useEffect(() => {
    setLocalWeekdayOverride(weekdayOverride ?? null)
  }, [weekdayOverride])

  useEffect(() => {
    const fetchWeekdays = async () => {
      const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
      const res = await fetch(`/api/schedules?classId=${encodeURIComponent(className)}${yearQ}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setAvailableWeekdays([])
        return
      }
      const payload = (await parseJsonSafe(res)) as { data?: Schedule[] } | Schedule[]
      const list = Array.isArray(payload) ? payload : (payload.data ?? [])
      const weekdays = Array.from(
        new Set(list.map((s) => s.selectedWeekday).filter((wd) => wd >= 1 && wd <= 5))
      ).sort((a, b) => a - b)
      setAvailableWeekdays(weekdays)
      if (weekdays.length > 0 && (localWeekdayOverride == null || !weekdays.includes(localWeekdayOverride))) {
        setLocalWeekdayOverride(weekdays[0] ?? null)
      }
    }
    void fetchWeekdays()
  }, [className, schoolYearId])

  const {
    groups,
    amAssignments,
    pmAssignments,
    scheduleTimes,
    breakTimes,
    turns,
    classHead,
    classLead,
    additionalInfo,
    weekday,
    loading: overviewLoading,
    error: overviewError
  } = useScheduleOverview(className, schoolYearId, localWeekdayOverride)

  if (overviewLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (overviewError) {
    const message =
      overviewError === 'Class ID is required' || overviewError === 'Failed to fetch schedule times'
        ? 'Keine Daten gefunden, bitte den Klassenleiter auffordner einen Wechselplan zu erstellen.'
        : overviewError
    return (
      <ScheduleMissingStateCard className={className} message={message} />
    )
  }

  return (
    <div className="space-y-4">
      {showWeekdayControl && availableWeekdays.length > 1 && (
        <Select
          value={localWeekdayOverride != null ? String(localWeekdayOverride) : undefined}
          onValueChange={(value) => {
            const wd = parseInt(value, 10)
            if (Number.isNaN(wd)) return
            setLocalWeekdayOverride(wd)
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Wochentag auswählen" />
          </SelectTrigger>
          <SelectContent>
            {availableWeekdays.map((wd) => (
              <SelectItem key={wd} value={String(wd)}>
                {weekdayLabels[wd] ?? `Wochentag ${wd}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <ScheduleOverview
        groups={groups}
        amAssignments={amAssignments}
        pmAssignments={pmAssignments}
        scheduleTimes={scheduleTimes}
        breakTimes={breakTimes}
        turns={turns}
        classHead={classHead}
        classLead={classLead}
        additionalInfo={additionalInfo}
        weekday={weekday}
        className={className}
        showExportButtons={true}
      />
    </div>
  )
}

/**
 * Renders an interactive page for viewing, filtering, and exporting class schedules.
 *
 * Allows users to select a class or view all classes, displays schedule availability, and provides detailed schedule overviews. Export options for PDF and Excel are available when a specific class with a schedule is selected; Excel export is restricted to teachers assigned to the class. Handles loading and error states, and supports collapsible panels for browsing all class schedules.
 */
export default function SchedulesPage() {
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [, setIsTeacherForClass] = useState(false)
  const [isTeacherForAM, setIsTeacherForAM] = useState(false)
  const [isTeacherForPM, setIsTeacherForPM] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const { isLoading: isLoadingCachedData } = useCachedData()
  const [savingPdf, setSavingPdf] = useState(false)
  const [savingPdfDatum, setSavingPdfDatum] = useState(false)
  const [savingExcelAM, setSavingExcelAM] = useState(false)
  const [savingExcelPM, setSavingExcelPM] = useState(false)
  const [expandedClass, setExpandedClass] = useState<string | null>(null)
  const [selectedWeekdayOverride, setSelectedWeekdayOverride] = useState<number | null>(null)
  const weekdayLabels: Record<number, string> = {
    1: 'Montag',
    2: 'Dienstag',
    3: 'Mittwoch',
    4: 'Donnerstag',
    5: 'Freitag',
  }

  const {
    weekday,
    loading: overviewLoading,
    error: overviewError
  } = useScheduleOverview(
    selectedClass !== 'all' ? selectedClass : null,
    schoolYearId,
    selectedWeekdayOverride
  )

  // Create a Map of class names to their schedule status
  const classScheduleMap = useMemo(() => {
    const map = new Map<string, boolean>()
    classes.forEach(cls => {
      const hasScheduleForClass = schedules.some(schedule => 
        schedule.classId !== null && schedule.classId === cls.id
      )
      map.set(cls.name, hasScheduleForClass)
    })
    return map
  }, [classes, schedules])

  // Helper function to check if a class has a schedule
  const hasSchedule = (className: string) => {
    return classScheduleMap.get(className) ?? false
  }

  const availableWeekdaysForSelectedClass = useMemo(() => {
    if (selectedClass === 'all') return []
    const classRecord = classes.find((c) => c.name === selectedClass)
    if (!classRecord) return []
    return Array.from(
      new Set(
        schedules
          .filter((s) => s.classId === classRecord.id)
          .map((s) => s.selectedWeekday)
          .filter((wd) => wd >= 1 && wd <= 5)
      )
    ).sort((a, b) => a - b)
  }, [selectedClass, classes, schedules])

  // Add effect to check if user is a teacher for the selected class
  useEffect(() => {
    /**
     * Determines whether the currently logged-in user is assigned as a teacher for the selected class and updates the state accordingly.
     *
     * If the user is not logged in or "all" classes are selected, the teacher assignment state is set to false.
     * Fetches the teacher record for the current user and the teacher assignments for the selected class, then checks for a matching assignment.
     */
    async function checkTeacherAssignment() {
      if (!session?.user?.name || selectedClass === 'all') {
        setIsTeacherForClass(false)
        setIsTeacherForAM(false)
        setIsTeacherForPM(false)
        return
      }

      try {
        // First, get the teacher record for the current user
        const teacherResponse = await fetch(`/api/teachers/by-username?username=${session.user.name}`)
        if (!teacherResponse.ok) {
          console.log('Failed to fetch teacher record:', teacherResponse.status)
          setIsTeacherForClass(false)
          setIsTeacherForAM(false)
          setIsTeacherForPM(false)
          return
        }

        const teacher = await teacherResponse.json()
        if (!teacher) {
          setIsTeacherForClass(false)
          setIsTeacherForAM(false)
          setIsTeacherForPM(false)
          return
        }

        // Resolve className to classId
        const classRes = await fetch(`/api/classes/get-by-name?name=${selectedClass}`)
        if (!classRes.ok) {
          setIsTeacherForClass(false)
          setIsTeacherForAM(false)
          setIsTeacherForPM(false)
          return
        }
        const classData = await classRes.json() as { id: number }
        
        // Then get the teacher assignments for the class (for selected school year)
        const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
        const weekdayQ = selectedWeekdayOverride != null ? `&selectedWeekday=${selectedWeekdayOverride}` : ''
        const response = await fetch(`/api/schedules/teacher-assignments?classId=${classData.id}${yearQ}${weekdayQ}`)
        if (!response.ok) {
          setIsTeacherForClass(false)
          setIsTeacherForAM(false)
          setIsTeacherForPM(false)
          return
        }

        const payload = await response.json() as { data?: TeacherAssignmentsResponse } | TeacherAssignmentsResponse
        const data: TeacherAssignmentsResponse =
          'data' in payload && payload.data != null ? payload.data : (payload as TeacherAssignmentsResponse)
        
        console.log('Teacher assignments data:', {
          teacherId: teacher.id,
          amAssignments: data.amAssignments.map(a => ({ teacherId: a.teacherId, name: `${a.teacherFirstName} ${a.teacherLastName}` })),
          pmAssignments: data.pmAssignments.map(a => ({ teacherId: a.teacherId, name: `${a.teacherFirstName} ${a.teacherLastName}` }))
        })

        // Check if user is assigned as a teacher in AM assignments
        const isAssignedAM = data.amAssignments.some(a => a.teacherId === teacher.id)
        // Check if user is assigned as a teacher in PM assignments
        const isAssignedPM = data.pmAssignments.some(a => a.teacherId === teacher.id)
        // Check if user is assigned to either period
        const isAssigned = isAssignedAM || isAssignedPM
        
        console.log('Is user assigned as teacher:', isAssigned, {
          teacherId: teacher.id,
          amMatch: isAssignedAM,
          pmMatch: isAssignedPM
        })
        
        setIsTeacherForClass(isAssigned)
        setIsTeacherForAM(isAssignedAM)
        setIsTeacherForPM(isAssignedPM)
      } catch {
        setIsTeacherForClass(false)
        setIsTeacherForAM(false)
        setIsTeacherForPM(false)
      }
    }

    void checkTeacherAssignment()
  }, [selectedClass, session?.user?.name, schoolYearId, selectedWeekdayOverride])

  useEffect(() => {
    void fetchData()
  }, [schoolYearId])

  useEffect(() => {
    const classParam = searchParams.get('class')
    const weekdayParam = searchParams.get('weekday')
    const parsedWeekday = weekdayParam ? parseInt(weekdayParam, 10) : NaN
    const validWeekday = !Number.isNaN(parsedWeekday) && parsedWeekday >= 1 && parsedWeekday <= 5 ? parsedWeekday : null
    if (classParam) {
      setSelectedClass(classParam)
      setSelectedWeekdayOverride(validWeekday)
    } else {
      setSelectedClass('all')
      setSelectedWeekdayOverride(null)
    }
  }, [searchParams])

  useEffect(() => {
    if (selectedClass === 'all') {
      setSelectedWeekdayOverride(null)
      return
    }
    if (availableWeekdaysForSelectedClass.length === 0) {
      setSelectedWeekdayOverride(null)
      return
    }
    if (
      selectedWeekdayOverride == null ||
      !availableWeekdaysForSelectedClass.includes(selectedWeekdayOverride)
    ) {
      setSelectedWeekdayOverride(availableWeekdaysForSelectedClass[0] ?? null)
    }
  }, [selectedClass, availableWeekdaysForSelectedClass, selectedWeekdayOverride])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const yearQ = schoolYearId != null ? `?schoolYearId=${schoolYearId}` : ''
      // Fetch schedules and classes for the selected school year (when no year, APIs return all)
      const schedulesRes = await fetch(`/api/schedules/all${yearQ}`, { cache: 'no-store' })
      if (!schedulesRes.ok) throw new Error('Failed to fetch schedules')
      const schedulesPayload = await parseJsonSafe(schedulesRes)
      const schedulesData = unwrapData<Schedule[]>(schedulesPayload)
      setSchedules(schedulesData)

      const classesRes = await fetch(`/api/classes${yearQ}`, { cache: 'no-store' })
      if (!classesRes.ok) throw new Error('Failed to fetch classes')
      const classesPayload = await parseJsonSafe(classesRes)
      const classesData = unwrapData<Class[]>(classesPayload)
      setClasses(classesData)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Failed to load data'
      setError(errMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleClassChange = (value: string) => {
    setSelectedClass(value)
    if (value === 'all') {
      setSelectedWeekdayOverride(null)
      router.push('/schedules?class=all')
      return
    }
    const classRecord = classes.find((c) => c.name === value)
    const classWeekdays = classRecord
      ? Array.from(
          new Set(
            schedules
              .filter((s) => s.classId === classRecord.id)
              .map((s) => s.selectedWeekday)
              .filter((wd) => wd >= 1 && wd <= 5)
          )
        ).sort((a, b) => a - b)
      : []
    const nextWeekday = classWeekdays[0] ?? null
    setSelectedWeekdayOverride(nextWeekday)
    const weekdayQ = nextWeekday != null ? `&weekday=${nextWeekday}` : ''
    router.push(`/schedules?class=${encodeURIComponent(value)}${weekdayQ}`)
  }

  if (loading || isLoadingCachedData || overviewLoading) return (
    <div className="p-8 flex items-center justify-center min-h-[200px]">
      <Spinner size="lg" />
    </div>
  )
  if (error) return <div className="p-8 text-center text-destructive">{error}</div>

  const handlePDFExport = async () => {
    setSavingPdf(true)
    try {
      await generatePdf(selectedClass, weekday ?? 0)
    } catch (error) {
      console.error('Error generating PDF:', error)
      // You might want to show a toast or error message to the user here
    } finally {
      setSavingPdf(false)
    }
  }

  const handlePDFDatumExport = async () => {
    setSavingPdfDatum(true)
    try {
      await generateSchedulePDF(selectedClass, weekday ?? 0)
    } catch (error) {
      console.error('Error generating PDF with date:', error)
      // You might want to show a toast or error message to the user here
    } finally {
      setSavingPdfDatum(false)
    }
  }

  const handleExcelAMExport = async () => {
    setSavingExcelAM(true)
    try {
      await generateExcel(selectedClass, weekday ?? 0, session?.user?.name ?? '', 'AM')
    } catch (error) {
      console.error('Error generating AM Excel:', error)
      // You might want to show a toast or error message to the user here
    } finally {
      setSavingExcelAM(false)
    }
  }

  const handleExcelPMExport = async () => {
    setSavingExcelPM(true)
    try {
      await generateExcel(selectedClass, weekday ?? 0, session?.user?.name ?? '', 'PM')
    } catch (error) {
      console.error('Error generating PM Excel:', error)
      // You might want to show a toast or error message to the user here
    } finally {
      setSavingExcelPM(false)
    }
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-2xl mt-8 font-bold mb-4">Übersicht Wechselpläne</h1>
        <div className="mb-6">
          <Select value={selectedClass} onValueChange={handleClassChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Klasse auswählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Klassen</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.name} className="flex items-center">
                  <span className="inline-block w-32 truncate">{cls.name}</span>
                  <div className="w-8 flex justify-center">
                    {hasSchedule(cls.name) ? (
                      <CheckCircle2 className="h-4 w-4 text-status-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-status-danger" />
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedClass !== 'all' && hasSchedule(selectedClass) && (
            <>
              {availableWeekdaysForSelectedClass.length > 1 && (
                <div className="mt-4">
                  <Select
                    value={selectedWeekdayOverride != null ? String(selectedWeekdayOverride) : undefined}
                    onValueChange={(value) => {
                      const wd = parseInt(value, 10)
                      if (Number.isNaN(wd)) return
                      setSelectedWeekdayOverride(wd)
                      router.push(`/schedules?class=${encodeURIComponent(selectedClass)}&weekday=${wd}`)
                    }}
                  >
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Wochentag auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableWeekdaysForSelectedClass.map((wd) => (
                        <SelectItem key={wd} value={String(wd)}>
                          {weekdayLabels[wd] ?? `Wochentag ${wd}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {selectedClass !== 'all' && hasSchedule(selectedClass) && (
            <ScheduleExportActions
              onPdfExport={handlePDFExport}
              onPdfDateExport={handlePDFDatumExport}
              onExcelAmExport={handleExcelAMExport}
              onExcelPmExport={handleExcelPMExport}
              savingPdf={savingPdf}
              savingPdfDate={savingPdfDatum}
              savingExcelAm={savingExcelAM}
              savingExcelPm={savingExcelPM}
              showExcelAm={isTeacherForAM}
              showExcelPm={isTeacherForPM}
            />
          )}

          {selectedClass !== 'all' && overviewError && (
            <ScheduleMissingStateCard className={selectedClass} message={overviewError} />
          )}
        </div>

        {/* Show all schedules when "All Classes" is selected */}
        {selectedClass === 'all' && (
          <div className="space-y-6 mt-6">
            {classes.map((cls) => {
              const hasScheduleForClass = hasSchedule(cls.name);
              const isExpanded = expandedClass === cls.name;
              return (
                <Collapsible 
                  key={cls.id} 
                  className="border rounded-lg bg-secondary"
                  open={isExpanded}
                  onOpenChange={(open) => setExpandedClass(open ? cls.name : null)}
                >
                  <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-semibold">{cls.name}</h3>
                      {hasScheduleForClass ? (
                        <CheckCircle2 className="h-5 w-5 text-status-success" />
                      ) : (
                        <XCircle className="h-5 w-5 text-status-danger" />
                      )}
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {hasScheduleForClass ? (
                      <div className="p-4 pt-0">
                        <ClassScheduleOverview className={cls.name} schoolYearId={schoolYearId} showWeekdayControl={true} />
                      </div>
                    ) : (
                      <ScheduleMissingStateCard className={cls.name} />
                    )}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Show single schedule when a specific class is selected */}
        {selectedClass !== 'all' && hasSchedule(selectedClass) && !overviewError && (
          <ClassScheduleOverview
            className={selectedClass}
            schoolYearId={schoolYearId}
            weekdayOverride={selectedWeekdayOverride}
            showWeekdayControl={false}
          />
        )}
      </div>
    </div>
  )
} 