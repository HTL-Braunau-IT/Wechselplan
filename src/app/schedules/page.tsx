'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { CheckCircle2, XCircle, AlertCircle, ChevronDown } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { generateExcel, generatePdf, generateSchedulePDF } from '~/lib/export-utils'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

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

/**
 * Displays the schedule overview for a given class, handling loading and error states.
 *
 * Renders a loading spinner while fetching data, an error message if no schedule is found, or the schedule overview when data is available.
 *
 * @param className - The name of the class for which to display the schedule overview.
 */
function ClassScheduleOverview({ className }: { className: string }) {
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
  } = useScheduleOverview(className)

  if (overviewLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (overviewError) {
    return (
      <Card className="m-4 border-destructive">
        <CardHeader className="pb-2">
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Kein Wechselplan für Klasse {className} gefunden!
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {overviewError === 'Class ID is required' 
              ? 'Keine Daten gefunden, bitte den Klassenleiter auffordner einen Wechselplan zu erstellen.'
              : overviewError === 'Failed to fetch schedule times'
              ? 'Keine Daten gefunden, bitte den Klassenleiter auffordner einen Wechselplan zu erstellen.'
              : overviewError}
          </p>
        </CardContent>
      </Card>
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
    />
  )
}

/**
 * Displays an interactive overview of all class schedules, allowing users to filter by class, view detailed schedule information, and export data.
 *
 * Fetches schedule and class data, manages loading and error states, and renders schedule overviews for individual classes or all classes. Provides export options for PDF and Excel formats when a specific class with a schedule is selected. The UI includes a class selector, schedule availability indicators, and collapsible panels for each class when viewing all classes.
 */
export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoading: isLoadingCachedData } = useCachedData()
  const [savingPdf, setSavingPdf] = useState(false)
  const [savingPdfDatum, setSavingPdfDatum] = useState(false)
  const [savingExcel, setSavingExcel] = useState(false)
  const [expandedClass, setExpandedClass] = useState<string | null>(null)

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
  } = useScheduleOverview(selectedClass !== 'all' ? selectedClass : null)

  useEffect(() => {
    void fetchData()
  }, [])

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

      // Fetch all schedules
      const schedulesRes = await fetch('/api/schedules/all')
      if (!schedulesRes.ok) throw new Error('Failed to fetch schedules')
      const schedulesData = await schedulesRes.json() as Schedule[]
      setSchedules(schedulesData)

      // Fetch all classes
      const classesRes = await fetch('/api/classes')
      if (!classesRes.ok) throw new Error('Failed to fetch classes')
      const classesData = await classesRes.json() as Class[]
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

  // Helper function to check if a class has a schedule
  const hasSchedule = (className: string) => {
    return schedules.some(schedule => schedule.classId !== null && classes.find(c => c.id === schedule.classId)?.name === className)
  }

  if (loading || isLoadingCachedData || overviewLoading) return (
    <div className="p-8 flex items-center justify-center min-h-[200px]">
      <Spinner size="lg" />
    </div>
  )
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  const handlePDFExport = async () => {
    setSavingPdf(true)
    await generatePdf(selectedClass, weekday ?? 0)
    setSavingPdf(false)
  }

  const handlePDFDatumExport = async () => {
    setSavingPdfDatum(true)
    await generateSchedulePDF(selectedClass, weekday ?? 0)
    setSavingPdfDatum(false)
  }

  const handleExcelExport = async () => {
    setSavingExcel(true)
    await generateExcel(selectedClass, weekday ?? 0)
    setSavingExcel(false)
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Schedules Overview</h1>
        <div className="mb-6">
          <Select value={selectedClass} onValueChange={handleClassChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select a class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.name} className="flex items-center justify-between">
                  <span>{cls.name}</span>
                  {hasSchedule(cls.name) ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 ml-2" />
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedClass !== 'all' && hasSchedule(selectedClass) && (
            <div className="flex items-center gap-2 mt-4">
              <button
                className="bg-primary text-primary-foreground px-6 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
                onClick={handlePDFExport}
                disabled={savingPdf}
              >
                {savingPdf ? 'Exporting PDF...' : 'PDF Export'}
              </button>
              <button
                className="bg-primary text-primary-foreground px-6 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
                onClick={handlePDFDatumExport}
                disabled={savingPdfDatum}
              >
                {savingPdfDatum ? 'Exporting PDF Datum ...' : 'PDF Datum Export'}
              </button>

              <button
                className="bg-primary text-primary-foreground px-6 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
                onClick={handleExcelExport}
                disabled={savingExcel}
              >
                {savingExcel ? 'Exporting Excel ...' : 'Export für Notenliste'}
              </button>
            </div>
          )}

          {selectedClass !== 'all' && overviewError && (
            <Card className="mt-4 border-destructive">
              <CardHeader className="pb-2">
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Kein Wechselplan für Klasse {selectedClass} gefunden!
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {overviewError === 'Class ID is required' 
                    ? 'Keine Daten gefunden, bitte den Klassenleiter auffordner einen Wechselplan zu erstellen.'
                    : overviewError === 'Failed to fetch schedule times'
                    ? 'Keine Daten gefunden, bitte den Klassenleiter auffordner einen Wechselplan zu erstellen.'
                    : overviewError}
                </p>
              </CardContent>
            </Card>
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
                  className="border rounded-lg"
                  open={isExpanded}
                  onOpenChange={(open) => setExpandedClass(open ? cls.name : null)}
                >
                  <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-semibold">{cls.name}</h3>
                      {hasScheduleForClass ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {hasScheduleForClass ? (
                      <div className="p-4 pt-0">
                        <ClassScheduleOverview className={cls.name} />
                      </div>
                    ) : (
                      <Card className="m-4 border-destructive">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-destructive flex items-center gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Kein Wechselplan für Klasse {cls.name} gefunden!
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground">
                            Keine Daten gefunden, bitte den Klassenleiter auffordner einen Wechselplan zu erstellen.
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Show single schedule when a specific class is selected */}
        {selectedClass !== 'all' && hasSchedule(selectedClass) && !overviewError && (
          <ClassScheduleOverview className={selectedClass} />
        )}
      </div>
    </div>
  )
} 