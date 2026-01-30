import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useTranslation } from "react-i18next"
import { AlertTriangle } from "lucide-react"
import { useScheduleOverview } from "@/hooks/use-schedule-overview"
import { ScheduleOverview } from "@/components/schedule-overview"
import { Spinner } from "@/components/ui/spinner"
import type { ScheduleResponse } from "@/types/types"

/**
 * Renders a schedule overview for the logged-in student with conditional weekday navigation tabs.
 *
 * Fetches the student's class and group, determines which weekdays have schedules, and displays
 * the schedule overview. Only shows weekday navigation tabs if there are multiple schedules,
 * and only displays tabs for weekdays that have schedules associated with them.
 *
 * @returns A React component showing the student's schedule overview with conditional weekday navigation and error alerts.
 */
export function StudentOverview() {
    const { data: session } = useSession()
    const { t } = useTranslation()
    const [studentClass, setStudentClass] = useState<string | null>(null)
    const [groupId, setGroupId] = useState<number | null>(null)
    const [availableWeekdays, setAvailableWeekdays] = useState<number[]>([])
    const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Fetch student's class and groupId
    useEffect(() => {
        const fetchStudentData = async () => {
            if (!session?.user?.name) return

            try {
                setLoading(true)
                setError(null)

                const response = await fetch(`/api/students/class?username=${session.user.name}`)
                if (!response.ok) {
                    const errorData = await response.json()
                    setError(errorData.error || 'Failed to fetch student data')
                    setLoading(false)
                    return
                }

                const data = await response.json()
                setStudentClass(data.class)
                setGroupId(data.groupId)

                // Fetch all schedules for the class to determine available weekdays
                const schedulesResponse = await fetch(`/api/schedules?classId=${data.class}`)
                if (!schedulesResponse.ok) {
                    setError('Failed to fetch schedules')
                    setLoading(false)
                    return
                }

                const schedules: ScheduleResponse[] = await schedulesResponse.json()
                
                if (schedules.length === 0) {
                    setError('No schedules found for your class')
                    setLoading(false)
                    return
                }

                // Extract unique weekdays
                const weekdaySet = new Set<number>()
                
                schedules.forEach(schedule => {
                    weekdaySet.add(schedule.selectedWeekday)
                })

                const weekdays = Array.from(weekdaySet).sort()
                setAvailableWeekdays(weekdays)

                // Set initial selected weekday (first available, or current day if available)
                const today = new Date().getDay()
                const initialWeekday = weekdays.includes(today) ? today : weekdays[0]
                setSelectedWeekday(initialWeekday)

            } catch (err) {
                console.error('Error fetching student data:', err)
                setError('Failed to load student information')
            } finally {
                setLoading(false)
            }
        }

        if (session?.user?.role === 'student') {
            void fetchStudentData()
        }
    }, [session?.user?.role, session?.user?.name])

    const handleTabChange = (value: string) => {
        const weekday = parseInt(value)
        if (!isNaN(weekday)) {
            setSelectedWeekday(weekday)
        }
    }

    const getWeekdayName = (weekday: number): string => {
        const weekdayNames: Record<number, string> = {
            1: t('overview.weekdays.monday'),
            2: t('overview.weekdays.tuesday'),
            3: t('overview.weekdays.wednesday'),
            4: t('overview.weekdays.thursday'),
            5: t('overview.weekdays.friday'),
        }
        return weekdayNames[weekday] || `Weekday ${weekday}`
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Spinner size="lg" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                    <p className="text-yellow-800 dark:text-yellow-200">{error}</p>
                </div>
            </div>
        )
    }

    if (!studentClass || selectedWeekday === null) {
        return null
    }

    // If only one schedule, display it directly without tabs
    if (availableWeekdays.length === 1) {
        return <ScheduleOverviewWrapper 
            className={studentClass} 
            weekday={availableWeekdays[0]}
            groupId={groupId}
        />
    }

    // Multiple schedules - show tabs
    return (
        <Tabs 
            defaultValue={`${selectedWeekday}`} 
            className="w-full" 
            onValueChange={handleTabChange}
        >
            <TabsList className="grid w-full bg-gray-100 dark:bg-gray-800" style={{ gridTemplateColumns: `repeat(${availableWeekdays.length}, 1fr)` }}>
                {availableWeekdays.map(weekday => (
                    <TabsTrigger 
                        key={weekday} 
                        value={`${weekday}`} 
                        className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:text-gray-300"
                    >
                        {getWeekdayName(weekday)}
                    </TabsTrigger>
                ))}
            </TabsList>
            {availableWeekdays.map(weekday => (
                <TabsContent key={weekday} value={`${weekday}`} className="mt-4">
                    <ScheduleOverviewWrapper 
                        className={studentClass} 
                        weekday={weekday}
                        groupId={groupId}
                    />
                </TabsContent>
            ))}
        </Tabs>
    )
}

/**
 * Wrapper component that fetches and displays schedule overview for a specific weekday.
 */
function ScheduleOverviewWrapper({ className, weekday, groupId }: { className: string; weekday: number; groupId: number | null }) {
    const {
        groups,
        amAssignments,
        pmAssignments,
        scheduleTimes,
        breakTimes,
        turns: defaultTurns,
        classHead,
        classLead,
        additionalInfo: defaultAdditionalInfo,
        loading: hookLoading,
        error: hookError
    } = useScheduleOverview(className)

    // Fetch schedule data for the specific weekday
    const [turns, setTurns] = useState(defaultTurns)
    const [additionalInfo, setAdditionalInfo] = useState(defaultAdditionalInfo)
    const [scheduleLoading, setScheduleLoading] = useState(true)
    const [scheduleError, setScheduleError] = useState<string | null>(null)

    useEffect(() => {
        const fetchScheduleForWeekday = async () => {
            try {
                setScheduleLoading(true)
                setScheduleError(null)
                const response = await fetch(`/api/schedules?classId=${className}&weekday=${weekday}`)
                if (!response.ok) {
                    setScheduleError('Failed to fetch schedule for this weekday')
                    setScheduleLoading(false)
                    return
                }
                const schedules: ScheduleResponse[] = await response.json()
                if (schedules.length > 0) {
                    // Get the most recent schedule for this weekday
                    const latestSchedule = schedules[0]
                    setTurns((latestSchedule.scheduleData || {}) as typeof defaultTurns)
                    setAdditionalInfo(latestSchedule.additionalInfo || '')
                } else {
                    setScheduleError('No schedule found for this weekday')
                }
            } catch (err) {
                console.error('Error fetching schedule for weekday:', err)
                setScheduleError('Failed to load schedule')
            } finally {
                setScheduleLoading(false)
            }
        }

        void fetchScheduleForWeekday()
    }, [className, weekday, defaultTurns])

    if (hookLoading || scheduleLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Spinner size="lg" />
            </div>
        )
    }

    if (hookError || scheduleError) {
        return (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                    <p className="text-yellow-800 dark:text-yellow-200">{hookError || scheduleError}</p>
                </div>
            </div>
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
            showExportButtons={false}
        />
    )
}
