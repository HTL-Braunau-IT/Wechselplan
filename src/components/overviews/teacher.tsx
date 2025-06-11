import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { ScheduleData, ScheduleTerm} from "@/types/types"


export function TeacherOverview() {
    const { data: session } = useSession()
    const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const today = new Date().getDay()
    

    const fetchData = async (weekday: number) => {
        setScheduleData(null)
        setError(null)
        if (!session?.user?.name) return
        const response = await fetch(`/api/schedules/data?teacher=${session.user.name}&weekday=${weekday}`)
        const data = await response.json()
        
        if (response.status === 230) {
            setError((data.error as string) ?? 'No schedule found for this day')
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
    }, [session?.user?.role])
    
    const renderScheduleInfo = () => {
        if (!scheduleData?.schedules) return null
        const currentDate = new Date()

        // Get all assignments for the teacher
        const assignments = scheduleData.assignments.map(assignment => {
            const classInfo = scheduleData.classdata?.find(c => c.id === assignment.classId)
            return {
                ...assignment,
                className: classInfo?.name ?? `Class ${assignment.classId}`
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
                    const parts = week.date.split('.')
                    if (parts.length !== 3) return false
                    const day = parseInt(parts[0]!)
                    const month = parseInt(parts[1]!)
                    const year = parseInt(parts[2]!)
                    const weekDate = new Date(2000 + year, month - 1, day)
                    return weekDate <= currentDate && weekDate.getTime() + (7 * 24 * 60 * 60 * 1000) > currentDate.getTime()
                })
            })
        }

        const getRemainingWeeks = (scheduleInfo: Record<string, ScheduleTerm> | undefined) => {
            if (!scheduleInfo) return 0
            const currentWeek = getCurrentWeek(scheduleInfo)
            if (!currentWeek) return 0
            return (currentWeek[1] as ScheduleTerm).weeks.filter(week => {
                const parts = week.date.split('.')
                if (parts.length !== 3) return false
                const day = parseInt(parts[0]!)
                const month = parseInt(parts[1]!)
                const year = parseInt(parts[2]!)
                const weekDate = new Date(2000 + year, month - 1, day)
                return weekDate > currentDate
            }).length
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
                    const currentTerm = currentWeek ? (currentWeek[1] as ScheduleTerm).name : 'No schedule'
                    const remainingWeeks = getRemainingWeeks(scheduleInfo)

                    return (
                        <div key={assignment.id} className="p-4 bg-white rounded-lg shadow">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-500">Current Class</p>
                                    <p className="font-semibold text-lg">{assignment.className}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-500">Current Term</p>
                                    <p className="font-semibold text-lg">{currentTerm}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-500">{assignment.period} Group</p>
                                    <p className="font-semibold text-lg">{assignment.groupId}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-500">Weeks Remaining</p>
                                    <p className="font-semibold text-lg">{remainingWeeks}</p>
                                </div>
                            </div>
                            <div className="border-t pt-4 mt-4">
                                <p className="text-sm text-gray-500 mb-2">Additional Info</p>
                                <p className="font-semibold text-lg">{scheduleData.schedules[0]?.[0]?.additionalInfo}</p>
                            </div>
                            
                            <div className="border-t pt-4 mt-4">
                                <p className="text-sm text-gray-500 mb-2">Students in {assignment.period} Group</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {getStudentsForGroup(assignment.groupId, assignment.classId).map(student => (
                                        <div key={student.id} className="p-2 bg-gray-50 rounded">
                                            <p className="font-medium">{student.firstName} {student.lastName}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        
        <Tabs defaultValue={`${today}`} className="w-full" onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="1">Monday</TabsTrigger>
                <TabsTrigger value="2">Tuesday</TabsTrigger>
                <TabsTrigger value="3">Wednesday</TabsTrigger>
                <TabsTrigger value="4">Thursday</TabsTrigger>
                <TabsTrigger value="5">Friday</TabsTrigger>
            </TabsList>
            <TabsContent value="1">
                {error ? <p className="text-red-500">{error}</p> : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="2">
                {error ? <p className="text-red-500">{error}</p> : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="3">
                {error ? <p className="text-red-500">{error}</p> : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="4">
                {error ? <p className="text-red-500">{error}</p> : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="5">
                {error ? <p className="text-red-500">{error}</p> : renderScheduleInfo()}
            </TabsContent>
        </Tabs>
    )
}

