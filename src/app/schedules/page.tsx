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
import { CheckCircle2, XCircle } from 'lucide-react'

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
 * Displays an overview of schedules and classes, allowing users to filter by class and view detailed group and teacher assignment tables.
 *
 * Fetches schedule and class data, manages loading and error states, and renders group overviews and AM/PM teacher assignment tables for the selected class. Provides a dropdown to select a class and conditionally displays detailed tables when a specific class is chosen.
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

  if (loading || isLoadingCachedData || overviewLoading) return <div className="p-8 text-center">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>
  if (selectedClass !== 'all' && overviewError) return <div className="p-8 text-center text-red-500">{overviewError}</div>

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
        </div>

        {/* Only show detailed overview if a class is selected */}
        {selectedClass !== 'all' && (
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
        )}
      </div>
    </div>
  )
} 