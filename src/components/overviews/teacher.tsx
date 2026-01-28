import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { ScheduleData, ScheduleTerm} from "@/types/types"
import { parse, isValid, isWithinInterval, addWeeks } from "date-fns"
import { useTranslation } from "react-i18next"
import { AlertTriangle } from "lucide-react"

/**
 * Renders a weekly schedule overview for the logged-in teacher with weekday navigation tabs.
 *
 * Fetches and displays the teacher's assignments, class and term details, group information, remaining weeks, additional info, and lists of students for each group. The schedule updates dynamically based on the selected weekday and the current user's session, with error handling and dark mode support.
 *
 * @returns A React component showing the teacher's schedule overview with internationalized weekday navigation and error alerts.
 */
export function TeacherOverview() {
    const { data: session } = useSession()
    const { t } = useTranslation()
    const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const today = new Date().getDay()
    

    const fetchData = async (weekday: number) => {
        setScheduleData(null)
        setError(null)
        if (!session?.user?.name) return
        const response = await fetch(`/api/schedules/data?teacher=${session.user.name}&weekday=${weekday}`)
        const data = await response.json()
        
        if (!response.ok) {
            setError(t('overview.teacher.noSchedule'))
            return
        }

        // Check if we have any schedules
        if (!data.schedules || data.schedules.length === 0 || data.schedules.every((s: ScheduleData['schedules'][0]) => s.length === 0)) {
            setError(t('overview.teacher.noSchedule'))
            return
        }
        
        setScheduleData(data as ScheduleData)
        if (process.env.NODE_ENV === "development") {

        }
    }

    const handleTabChange = (value: string) => {
        const weekday = parseInt(value)
        if (weekday < 6 && weekday > 0) {
            setScheduleData(null)
            setError(null)
            void fetchData(weekday)
        }
    }

    useEffect(() => {
        if (session?.user?.role === 'teacher') {
            const weekday = today === 0 || today === 6 ? 1 : today // Default to Monday if weekend
            // Clear schedule data before initial fetch
            setScheduleData(null)
            setError(null)
            void fetchData(weekday)
        }
    }, [session?.user?.role, today])
    
    const renderScheduleInfo = () => {
        if (!scheduleData?.schedules) return null
        const currentDate = new Date()

        // Get all assignments for the teacher
        const assignments = scheduleData.assignments.map(assignment => {
            const classInfo = scheduleData.classdata?.find(c => c.id === assignment.classId)
            return {
                ...assignment,
                className: classInfo?.name ?? `Class ${assignment.classId}`,
                classHead: classInfo?.classHead ?? '—',
                classLead: classInfo?.classLead ?? '—'
            }
        }).sort((a, b) => {
            // Sort AM before PM
            if (a.period === 'AM' && b.period === 'PM') return -1
            if (a.period === 'PM' && b.period === 'AM') return 1
            return 0
        })

        const getScheduleInfo = (classId: number) => {
            const classSchedule = scheduleData.schedules.find(schedules => 
                schedules.some(s => Number(s.classId) === classId)
            )

            return classSchedule?.[0]?.scheduleData
        }

        const getCurrentWeek = (scheduleInfo: Record<string, ScheduleTerm> | undefined) => {
            if (!scheduleInfo) {
                console.log("No schedule info found")
                return null
            }

            return Object.entries(scheduleInfo).find(([_, data]) => {
                const termData = data as ScheduleTerm
                return termData.weeks.some(week => {
                    // Parse the date string using date-fns
                    const parsedDate = parse(week.date, 'dd.MM.yy', new Date())
                    if (!isValid(parsedDate)) return false
                    
                    // Check if current date is within the week
                    const weekEnd = addWeeks(parsedDate, 1)
                    return isWithinInterval(currentDate, {
                        start: parsedDate,
                        end: weekEnd
                    })
                })
            })
        }

        const getRemainingWeeks = (scheduleInfo: Record<string, ScheduleTerm> | undefined) => {
            if (!scheduleInfo) return 0
            const currentWeek = getCurrentWeek(scheduleInfo)
            if (!currentWeek) return 0
            return (currentWeek[1] as ScheduleTerm).weeks.filter(week => {
                const parsedDate = parse(week.date, 'dd.MM.yy', new Date())
                return isValid(parsedDate) && parsedDate > currentDate
            }).length
        }

        // Helper function to rotate array
        const rotateArray = <T,>(arr: T[], n: number): T[] => {
            const rotated = [...arr]
            for (let i = 0; i < n; i++) {
                const temp = rotated.shift()
                if (temp !== undefined) {
                    rotated.push(temp)
                }
            }
            return rotated
        }

        // Get current turn index based on current date
        const getCurrentTurnIndex = (scheduleInfo: Record<string, ScheduleTerm> | undefined): number => {
            if (!scheduleInfo) return 0
            
            const turnKeys = Object.keys(scheduleInfo).sort()
            const currentWeek = getCurrentWeek(scheduleInfo)
            
            if (!currentWeek) return 0
            
            // Find which turn we're in
            const turnIndex = turnKeys.findIndex(key => key === currentWeek[0])
            return turnIndex >= 0 ? turnIndex : 0
        }

        // Calculate the actual group for a teacher based on rotation
        const getActualGroupForAssignment = (assignment: typeof assignments[0]): number | null => {
            const scheduleInfo = getScheduleInfo(assignment.classId)
            if (!scheduleInfo) return assignment.groupId ?? null

            // Get groups for this class from students
            const classStudents = scheduleData.students.find(students => 
                students.some(student => student.classId === assignment.classId)
            )
            if (!classStudents) return assignment.groupId ?? null

            // Get unique group IDs and sort them
            const groupIds = [...new Set(classStudents
                .filter(s => s.classId === assignment.classId && s.groupId)
                .map(s => s.groupId as number)
            )].sort((a, b) => a - b)

            if (groupIds.length === 0) return assignment.groupId ?? null

            // Get unique teachers for this period and class
            const periodAssignments = scheduleData.assignments.filter(a => 
                a.classId === assignment.classId && 
                a.period === assignment.period
            )
            const uniqueTeachers = periodAssignments
                .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx)
                .sort((a, b) => a.teacherId - b.teacherId)

            // Find teacher index
            const teacherIndex = uniqueTeachers.findIndex(t => t.teacherId === assignment.teacherId)
            if (teacherIndex === -1) return assignment.groupId ?? null

            // Get current turn index
            const turnIndex = getCurrentTurnIndex(scheduleInfo)

            // Rotate groups based on turn
            const rotatedGroups = rotateArray(groupIds, turnIndex)
            
            // Return the group for this teacher's index
            return rotatedGroups[teacherIndex] ?? assignment.groupId ?? null
        }

        const getStudentsForGroup = (groupId: number | undefined, classId: number | undefined) => {
            if (!groupId || !classId) return []
            // Find the array of students for this class
            const classStudents = scheduleData.students.find(students => 
                students.some(student => student.classId === classId)
            )
            return classStudents?.filter(student => 
                student.groupId === groupId && 
                student.classId === classId
            ) ?? []
        }

        return (
            <div className="space-y-6">
                {assignments.map(assignment => {
                    const scheduleInfo = getScheduleInfo(assignment.classId)
                    const currentWeek = getCurrentWeek(scheduleInfo)
                    const currentTerm = currentWeek ? (currentWeek[1] as ScheduleTerm).name : t('overview.teacher.noSchedule')
                    const remainingWeeks = getRemainingWeeks(scheduleInfo)
                    const actualGroupId = getActualGroupForAssignment(assignment)

                    return (
                        <div key={assignment.id} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('overview.teacher.currentClass')}</p>
                                    <p className="font-semibold text-lg dark:text-white">{assignment.className}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('overview.teacher.currentTerm')}</p>
                                    <p className="font-semibold text-lg dark:text-white">{currentTerm}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{t(`overview.teacher.${assignment.period.toLowerCase()}Group`)}</p>
                                    <p className="font-semibold text-lg dark:text-white">{actualGroupId ?? '—'}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('overview.teacher.weeksRemaining')}</p>
                                    <p className="font-semibold text-lg dark:text-white">{remainingWeeks}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('overview.teacher.classHead')}</p>
                                    <p className="font-semibold text-lg dark:text-white">{assignment.classHead}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('overview.teacher.classLead')}</p>
                                    <p className="font-semibold text-lg dark:text-white">{assignment.classLead}</p>
                                </div>
                            </div>
                            <div className="border-t dark:border-gray-700 pt-4 mt-4">
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('overview.teacher.additionalInfo')}</p>
                                <p className="font-semibold text-lg dark:text-white">
                                    {
                                        scheduleData.schedules
                                            .find(sList => sList.some(s => Number(s.classId) === assignment.classId))
                                            ?.at(0)
                                            ?.additionalInfo ?? '—'
                                    }
                                </p>
                            </div>
                            
                            <div className="border-t dark:border-gray-700 pt-4 mt-4">
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('overview.teacher.studentsInGroup', { period: assignment.period })}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {(() => {
                                        const sortedStudents = getStudentsForGroup(actualGroupId ?? undefined, assignment.classId)
                                            .sort((a, b) => a.lastName.localeCompare(b.lastName))
                                        
                                        const leftColumnStudents = sortedStudents.slice(0, 6)
                                        const rightColumnStudents = sortedStudents.slice(6, 12)
                                        
                                        return (
                                            <>
                                                <div className="space-y-2">
                                                    {leftColumnStudents.map((student, index) => (
                                                        <div key={student.id} className="p-2 bg-gray-50 dark:bg-gray-700 rounded">
                                                            <p className="font-medium dark:text-white">{index + 1}. {student.lastName} {student.firstName} </p>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="space-y-2">
                                                    {rightColumnStudents.map((student, index) => (
                                                        <div key={student.id} className="p-2 bg-gray-50 dark:bg-gray-700 rounded">
                                                            <p className="font-medium dark:text-white">{index + 7}. {student.lastName} {student.firstName} </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <Tabs defaultValue={`${today === 0 || today === 6 ? 1 : today}`} className="w-full" onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-5 bg-gray-100 dark:bg-gray-800">
                <TabsTrigger value="1" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:text-gray-300">{t('overview.weekdays.monday')}</TabsTrigger>
                <TabsTrigger value="2" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:text-gray-300">{t('overview.weekdays.tuesday')}</TabsTrigger>
                <TabsTrigger value="3" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:text-gray-300">{t('overview.weekdays.wednesday')}</TabsTrigger>
                <TabsTrigger value="4" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:text-gray-300">{t('overview.weekdays.thursday')}</TabsTrigger>
                <TabsTrigger value="5" className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 dark:text-gray-300">{t('overview.weekdays.friday')}</TabsTrigger>
            </TabsList>
            <TabsContent value="1" className="mt-4">
                {error ? (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                            <p className="text-yellow-800 dark:text-yellow-200">{error}</p>
                        </div>
                    </div>
                ) : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="2" className="mt-4">
                {error ? (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                            <p className="text-yellow-800 dark:text-yellow-200">{error}</p>
                        </div>
                    </div>
                ) : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="3" className="mt-4">
                {error ? (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                            <p className="text-yellow-800 dark:text-yellow-200">{error}</p>
                        </div>
                    </div>
                ) : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="4" className="mt-4">
                {error ? (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                            <p className="text-yellow-800 dark:text-yellow-200">{error}</p>
                        </div>
                    </div>
                ) : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="5" className="mt-4">
                {error ? (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                            <p className="text-yellow-800 dark:text-yellow-200">{error}</p>
                        </div>
                    </div>
                ) : renderScheduleInfo()}
            </TabsContent>
        </Tabs>
    )
}

