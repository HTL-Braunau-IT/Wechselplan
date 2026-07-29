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
} from '@/components/ui/select'
import { useCachedData } from '@/hooks/use-cached-data'
import { useScheduleOverview } from '@/hooks/use-schedule-overview'
import { ScheduleOverview } from '@/components/schedule-overview'
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  FileDown,
  FileSpreadsheet,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { generateExcel, generatePdf, generateSchedulePDF } from '@/lib/export-utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

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
}: {
  className: string
  schoolYearId: number | undefined
}) {
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
    error: overviewError,
  } = useScheduleOverview(className, schoolYearId)

  if (overviewLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Spinner size="lg" />
      </div>
    )
  }

  if (overviewError) {
    return (
      <Alert variant="destructive" className="m-4 w-auto">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Kein Wechselplan für Klasse {className} gefunden!</AlertTitle>
        <AlertDescription>
          {overviewError === 'Class ID is required'
            ? 'Keine Daten gefunden, bitte den Klassenleiter auffordern einen Wechselplan zu erstellen.'
            : overviewError === 'Failed to fetch schedule times'
              ? 'Keine Daten gefunden, bitte den Klassenleiter auffordern einen Wechselplan zu erstellen.'
              : overviewError}
        </AlertDescription>
      </Alert>
    )
  }

  return (
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

  const {
    weekday,
    loading: overviewLoading,
    error: overviewError,
  } = useScheduleOverview(selectedClass !== 'all' ? selectedClass : null, schoolYearId)

  // Create a Map of class names to their schedule status
  const classScheduleMap = useMemo(() => {
    const map = new Map<string, boolean>()
    classes.forEach(cls => {
      const hasScheduleForClass = schedules.some(
        schedule => schedule.classId !== null && schedule.classId === cls.id,
      )
      map.set(cls.name, hasScheduleForClass)
    })
    return map
  }, [classes, schedules])

  // Helper function to check if a class has a schedule
  const hasSchedule = (className: string) => {
    return classScheduleMap.get(className) ?? false
  }

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
        const teacherResponse = await fetch(
          `/api/teachers/by-username?username=${session.user.name}`,
        )
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
        const classData = (await classRes.json()) as { id: number }

        // Then get the teacher assignments for the class (for selected school year)
        const yearQ = schoolYearId != null ? `&schoolYearId=${schoolYearId}` : ''
        const response = await fetch(
          `/api/schedules/teacher-assignments?classId=${classData.id}${yearQ}`,
        )
        if (!response.ok) {
          setIsTeacherForClass(false)
          setIsTeacherForAM(false)
          setIsTeacherForPM(false)
          return
        }

        const data = (await response.json()) as TeacherAssignmentsResponse

        // Check if user is assigned as a teacher in AM assignments
        const isAssignedAM = data.amAssignments.some(a => a.teacherId === teacher.id)
        // Check if user is assigned as a teacher in PM assignments
        const isAssignedPM = data.pmAssignments.some(a => a.teacherId === teacher.id)
        // Check if user is assigned to either period
        const isAssigned = isAssignedAM || isAssignedPM

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
  }, [selectedClass, session?.user?.name, schoolYearId])

  useEffect(() => {
    void fetchData()
  }, [schoolYearId])

  useEffect(() => {
    const classParam = searchParams.get('class')
    if (classParam) {
      setSelectedClass(classParam)
    } else {
      setSelectedClass('all')
    }
  }, [searchParams])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const yearQ = schoolYearId != null ? `?schoolYearId=${schoolYearId}` : ''
      // Fetch schedules and classes for the selected school year (when no year, APIs return all)
      const schedulesRes = await fetch(`/api/schedules/all${yearQ}`, { cache: 'no-store' })
      if (!schedulesRes.ok) throw new Error('Failed to fetch schedules')
      const schedulesData = (await schedulesRes.json()) as Schedule[]
      setSchedules(schedulesData)

      const classesRes = await fetch(`/api/classes${yearQ}`, { cache: 'no-store' })
      if (!classesRes.ok) throw new Error('Failed to fetch classes')
      const classesData = (await classesRes.json()) as Class[]
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
    router.push(`/schedules?class=${encodeURIComponent(value)}`)
  }

  if (loading || isLoadingCachedData || overviewLoading)
    return (
      <div className="flex min-h-[200px] items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    )
  if (error)
    return (
      <PageContainer size="wide">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler beim Laden</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </PageContainer>
    )

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
    <PageContainer size="wide">
      <div className="space-y-6">
        <PageHeader
          icon={CalendarDays}
          title="Schedules Overview"
          description="Wechselpläne aller Klassen einsehen und exportieren."
        />

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="class-select">Klasse</Label>
            <Select value={selectedClass} onValueChange={handleClassChange}>
              <SelectTrigger id="class-select" className="w-[220px]">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {classes.map(cls => (
                  <SelectItem key={cls.id} value={cls.name} className="flex items-center">
                    <span className="inline-block w-32 truncate">{cls.name}</span>
                    <div className="flex w-8 justify-center">
                      {hasSchedule(cls.name) ? (
                        <CheckCircle2 className="text-success h-4 w-4" />
                      ) : (
                        <XCircle className="text-destructive h-4 w-4" />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedClass !== 'all' && hasSchedule(selectedClass) && (
            <div className="flex flex-wrap items-center gap-2">
              <Button className="gap-2" onClick={handlePDFExport} disabled={savingPdf}>
                {savingPdf ? <Spinner size="sm" /> : <FileDown className="h-4 w-4" />}
                {savingPdf ? 'Exporting PDF...' : 'PDF Export'}
              </Button>
              <Button className="gap-2" onClick={handlePDFDatumExport} disabled={savingPdfDatum}>
                {savingPdfDatum ? <Spinner size="sm" /> : <FileDown className="h-4 w-4" />}
                {savingPdfDatum ? 'Exporting PDF Datum ...' : 'PDF Datum Export'}
              </Button>

              {/* AM Excel Export Button - only show if teacher is assigned to AM */}
              {isTeacherForAM && (
                <Button
                  variant="secondary"
                  className="gap-2"
                  onClick={handleExcelAMExport}
                  disabled={savingExcelAM}
                >
                  {savingExcelAM ? (
                    <>
                      <Spinner size="sm" />
                      Exporting AM Excel ...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-4 w-4" />
                      Export Notenliste Vormittag
                    </>
                  )}
                </Button>
              )}

              {/* PM Excel Export Button - only show if teacher is assigned to PM */}
              {isTeacherForPM && (
                <Button
                  variant="secondary"
                  className="gap-2"
                  onClick={handleExcelPMExport}
                  disabled={savingExcelPM}
                >
                  {savingExcelPM ? (
                    <>
                      <Spinner size="sm" />
                      Exporting PM Excel ...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-4 w-4" />
                      Export Notenliste Nachmittag
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {selectedClass !== 'all' && overviewError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Kein Wechselplan für Klasse {selectedClass} gefunden!</AlertTitle>
              <AlertDescription>
                {overviewError === 'Class ID is required'
                  ? 'Keine Daten gefunden, bitte den Klassenleiter auffordern einen Wechselplan zu erstellen.'
                  : overviewError === 'Failed to fetch schedule times'
                    ? 'Keine Daten gefunden, bitte den Klassenleiter auffordern einen Wechselplan zu erstellen.'
                    : overviewError}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Show all schedules when "All Classes" is selected */}
        {selectedClass === 'all' &&
          (classes.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Keine Klassen gefunden"
              description="Für das ausgewählte Schuljahr sind keine Klassen vorhanden."
            />
          ) : (
            <div className="space-y-6">
              {classes.map(cls => {
                const hasScheduleForClass = hasSchedule(cls.name)
                const isExpanded = expandedClass === cls.name
                return (
                  <Collapsible
                    key={cls.id}
                    className="rounded-lg border"
                    open={isExpanded}
                    onOpenChange={open => setExpandedClass(open ? cls.name : null)}
                  >
                    <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center justify-between p-4 transition-colors">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-semibold">{cls.name}</h3>
                        {hasScheduleForClass ? (
                          <CheckCircle2 className="text-success h-5 w-5" />
                        ) : (
                          <XCircle className="text-destructive h-5 w-5" />
                        )}
                      </div>
                      <ChevronDown
                        className={`text-muted-foreground h-5 w-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {hasScheduleForClass ? (
                        <div className="p-4 pt-0">
                          <ClassScheduleOverview className={cls.name} schoolYearId={schoolYearId} />
                        </div>
                      ) : (
                        <Alert variant="destructive" className="m-4 w-auto">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Kein Wechselplan für Klasse {cls.name} gefunden!</AlertTitle>
                          <AlertDescription>
                            Keine Daten gefunden, bitte den Klassenleiter auffordern einen
                            Wechselplan zu erstellen.
                          </AlertDescription>
                        </Alert>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          ))}

        {/* Show single schedule when a specific class is selected */}
        {selectedClass !== 'all' && hasSchedule(selectedClass) && !overviewError && (
          <ClassScheduleOverview className={selectedClass} schoolYearId={schoolYearId} />
        )}
      </div>
    </PageContainer>
  )
}
