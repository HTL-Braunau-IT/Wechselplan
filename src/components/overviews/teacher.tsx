import { useEffect, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import type { TeacherScheduleData, NormalizedTurn, BreakTime, ScheduleTime, Assignment } from "@/types/types"
import { parse, isValid, addWeeks } from "date-fns"
import { AlertTriangle } from "lucide-react"
import { StudentPhoto } from "@/components/student-photo"
import { getApiErrorMessage, parseJsonSafe, unwrapData } from '@/lib/api-client'
import { useInViewOnce } from '@/hooks/use-in-view-once'
import { cn } from '@/lib/utils'
import { getCurrentCalendarWeekRow, normalizedTurnsToTurnSchedule, teacherOverviewShowFullAssignmentCard } from '@/lib/teacher-overview-week'
import { pmNachmittagJa, turnScheduleHasPmRhythm } from '@/lib/pm-biweekly-track'

const NO_SCHEDULE_MSG = 'Kein Wechselplan für diesen Tag gefunden'

function periodGroupLabel(period: string): string {
    const p = period.toLowerCase()
    if (p === 'am') return 'Vormittagsgruppe'
    if (p === 'pm') return 'Nachmittagsgruppe'
    return `${period}-Gruppe`
}

function TeacherAssignmentReveal({
    index,
    className,
    children,
}: {
    index: number
    className?: string
    children: ReactNode
}) {
    const [ref, isVisible] = useInViewOnce()
    return (
        <div
            ref={ref}
            className={cn(
                className,
                'transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none',
                isVisible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
            )}
            style={{ transitionDelay: `${Math.min(index, 6) * 50}ms` }}
        >
            {children}
        </div>
    )
}

/**
 * Renders a weekly schedule overview for the logged-in teacher with weekday navigation tabs.
 *
 * Fetches and displays the teacher's assignments, class and term details, group information, remaining weeks, additional info, and lists of students for each group. The schedule updates dynamically based on the selected weekday and the current user's session, with error handling and dark mode support.
 *
 * @returns A React component showing the teacher's schedule overview with weekday navigation and error alerts.
 */
export function TeacherOverview() {
    const { data: session } = useSession()
    const [scheduleData, setScheduleData] = useState<TeacherScheduleData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const today = new Date().getDay()
    

    const fetchData = async (weekday: number) => {
        setScheduleData(null)
        setError(null)
        if (!session?.user?.name) return
        const response = await fetch(`/api/schedules/data?teacher=${session.user.name}&weekday=${weekday}`)
        const payload = await parseJsonSafe(response)
        
        if (!response.ok) {
            setError(getApiErrorMessage(payload, NO_SCHEDULE_MSG))
            return
        }
        const data = unwrapData<TeacherScheduleData>(payload)

        // Check if we have any schedules
        if (!data.schedules || data.schedules.length === 0 || data.schedules.every((s: TeacherScheduleData['schedules'][0]) => s.length === 0)) {
            setError(NO_SCHEDULE_MSG)
            return
        }
        
        setScheduleData(data as TeacherScheduleData)
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
        const classAssignments = scheduleData.classAssignments ?? scheduleData.assignments

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

        const getTurnsForClass = (classId: number): NormalizedTurn[] | undefined => {
            const classSchedule = scheduleData.schedules.find(schedules =>
                schedules.some(s => Number(s.classId) === classId)
            )
            return classSchedule?.[0]?.turns
        }

        type CurrentWeekResult = { turnIndex: number; turn: NormalizedTurn } | null

        const getCurrentWeek = (turns: NormalizedTurn[] | undefined): CurrentWeekResult => {
            const row = getCurrentCalendarWeekRow(turns, currentDate)
            return row ? { turnIndex: row.turnIndex, turn: row.turn } : null
        }

        const getRemainingWeeks = (turns: NormalizedTurn[] | undefined): number => {
            const currentWeek = getCurrentWeek(turns)
            if (!currentWeek) return 0
            return currentWeek.turn.weeks.filter(week => {
                if (week.includedInPlan === false) return false
                const parsedDate = parse(week.date, 'dd.MM.yy', new Date())
                return isValid(parsedDate) && parsedDate > currentDate
            }).length
        }

        const rotateArray = <T,>(arr: T[], n: number): T[] => {
            const rotated = [...arr]
            for (let i = 0; i < n; i++) {
                const temp = rotated.shift()
                if (temp !== undefined) rotated.push(temp)
            }
            return rotated
        }

        const getCurrentTurnIndex = (turns: NormalizedTurn[] | undefined): number => {
            const currentWeek = getCurrentWeek(turns)
            return currentWeek?.turnIndex ?? 0
        }

        const getActualGroupForAssignment = (assignment: Assignment): number | null => {
            const turns = getTurnsForClass(assignment.classId)
            if (!turns) return assignment.groupId ?? null

            const currentWeek = getCurrentWeek(turns)
            if (currentWeek && scheduleData.teacherRotation?.length) {
                const turnName = currentWeek.turn.name
                const rotation = scheduleData.teacherRotation.find(
                    (r: { teacherId: number | string; classId: number; period: string; turnName?: string }) =>
                        Number(r.teacherId) === Number(assignment.teacherId) &&
                        r.classId === assignment.classId &&
                        r.period === assignment.period &&
                        r.turnName === turnName
                )
                if (rotation) return (rotation as { groupId: number }).groupId
            }

            const classStudents = scheduleData.students.find(students =>
                students.some(student => student.classId === assignment.classId)
            )
            if (!classStudents) return assignment.groupId ?? null

            const groupIds = [...new Set(classStudents
                .filter(s => s.classId === assignment.classId && s.groupId)
                .map(s => s.groupId as number)
            )].sort((a, b) => a - b)

            if (groupIds.length === 0) return assignment.groupId ?? null

            const periodAssignments = classAssignments.filter(a =>
                a.classId === assignment.classId &&
                a.period === assignment.period
            )
            const uniqueTeachers = periodAssignments
                .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx)
                .sort((a, b) => a.teacherId - b.teacherId)

            const teacherIndex = uniqueTeachers.findIndex(t => t.teacherId === assignment.teacherId)
            if (teacherIndex === -1) return assignment.groupId ?? null

            const turnIndex = getCurrentTurnIndex(turns)
            const rotatedGroups = rotateArray(groupIds, turnIndex)
            return rotatedGroups[teacherIndex] ?? assignment.groupId ?? null
        }

        const getTeacherDisplayName = (assignment: Assignment): string => {
            const firstName = assignment.teacherFirstName?.trim()
            const lastName = assignment.teacherLastName?.trim()
            const fullName = [firstName, lastName].filter(Boolean).join(' ')
            return fullName || 'Unbekannter Lehrer'
        }

        const getOtherGroupAssignments = (assignment: typeof assignments[0], currentGroupId: number | null) => {
            return classAssignments
                .filter(candidate =>
                    candidate.classId === assignment.classId &&
                    candidate.period === assignment.period
                )
                .map(candidate => ({
                    ...candidate,
                    actualGroupId: getActualGroupForAssignment(candidate)
                }))
                .filter(candidate =>
                    candidate.actualGroupId != null &&
                    candidate.actualGroupId !== currentGroupId
                )
                .sort((a, b) => (a.actualGroupId ?? 0) - (b.actualGroupId ?? 0))
        }

        const getStudentsForGroup = (groupId: number | undefined, classId: number | undefined) => {
            if (groupId == null || classId == null) return []
            // Find the array of students for this class
            const classStudents = scheduleData.students.find(students => 
                students.some(student => student.classId === classId)
            )
            return classStudents?.filter(student => 
                student.groupId === groupId && 
                student.classId === classId
            ) ?? []
        }

        const getScheduleTimes = (classId: number, period: string): ScheduleTime | undefined => {
            const classSchedule = scheduleData.schedules.find(schedules =>
                schedules.some(s => Number(s.classId) === classId)
            )
            return classSchedule?.[0]?.scheduleTimes?.find((time: ScheduleTime) => time.period === period)
        }

        const getBreakTimes = (classId: number, period: string): BreakTime[] => {
            const classSchedule = scheduleData.schedules.find(schedules =>
                schedules.some(s => Number(s.classId) === classId)
            )
            const schedule = classSchedule?.[0]
            if (!schedule?.breakTimes) return []
            return schedule.breakTimes.filter((time: BreakTime) =>
                time.period === period || time.period === 'LUNCH'
            )
        }

        return (
            <div className="space-y-6">
                {assignments.map((assignment, index) => {
                    const turns = getTurnsForClass(assignment.classId)
                    const calendarWeekRow = getCurrentCalendarWeekRow(turns, currentDate)
                    const currentWeek = calendarWeekRow
                        ? { turnIndex: calendarWeekRow.turnIndex, turn: calendarWeekRow.turn }
                        : null
                    const currentTerm = currentWeek ? currentWeek.turn.name : NO_SCHEDULE_MSG
                    const remainingWeeks = getRemainingWeeks(turns)
                    const actualGroupId = getActualGroupForAssignment(assignment)

                    const hasPmRhythm = Boolean(
                        turns?.length && turnScheduleHasPmRhythm(normalizedTurnsToTurnSchedule(turns))
                    )
                    const turnsLen = turns?.length ?? 0
                    const showFullTimetable = teacherOverviewShowFullAssignmentCard(
                        assignment,
                        calendarWeekRow,
                        turnsLen,
                        hasPmRhythm
                    )

                    const compactInactiveMessage = (() => {
                        if (!turnsLen || !calendarWeekRow) return NO_SCHEDULE_MSG
                        if (calendarWeekRow.week.isHoliday) {
                            return 'Für diese Kalenderwoche ist kein Unterricht vorgesehen (Feiertag).'
                        }
                        if (
                            assignment.period === 'PM' &&
                            hasPmRhythm &&
                            !pmNachmittagJa(assignment.pmTrack, calendarWeekRow.week)
                        ) {
                            return 'Nachmittag diese Woche nicht im geplanten Rhythmus.'
                        }
                        return NO_SCHEDULE_MSG
                    })()

                    if (!showFullTimetable) {
                        return (
                            <TeacherAssignmentReveal
                                key={assignment.id}
                                index={index}
                                className="border border-border/70 rounded-lg bg-muted/40 p-4 shadow"
                            >
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">Aktuelle Klasse</p>
                                    <p className="font-semibold text-lg">{assignment.className}</p>
                                    <p className="text-sm text-muted-foreground">Zeitraum</p>
                                    <p className="font-semibold">{periodGroupLabel(assignment.period)}</p>
                                    <p className="text-sm text-muted-foreground pt-2 border-t border-border/60 mt-2">
                                        {compactInactiveMessage}
                                    </p>
                                </div>
                            </TeacherAssignmentReveal>
                        )
                    }

                    const scheduleTime = getScheduleTimes(assignment.classId, assignment.period)
                    const breakTimes = getBreakTimes(assignment.classId, assignment.period)
                    const otherGroups = getOtherGroupAssignments(assignment, actualGroupId)

                    return (
                        <TeacherAssignmentReveal
                            key={assignment.id}
                            index={index}
                            className="border border-border/70 rounded-lg bg-card p-4 shadow"
                        >
                            <div className="flex justify-start mb-4">
                                <Link href={actualGroupId != null ? `/noten?classId=${assignment.classId}&groupId=${actualGroupId}` : `/noten?classId=${assignment.classId}`}>
                                    <Button size="sm">
                                        Notenliste
                                    </Button>
                                </Link>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">Aktuelle Klasse</p>
                                    <p className="font-semibold text-lg">{assignment.className}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">Aktueller Turnus</p>
                                    <p className="font-semibold text-lg">
                                        {typeof currentTerm === 'string'
                                            ? currentTerm.replace(/^TURNUS\s*/i, '').trim() || currentTerm
                                            : currentTerm}
                                    </p>
                               
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">{"Gruppe"}</p>
                                    <p className="font-semibold text-lg">{actualGroupId ?? '—'}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">Verbleibende Wochen</p>
                                    <p className="font-semibold text-lg">{remainingWeeks}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">Klassenvorstand</p>
                                    <p className="font-semibold text-lg">{assignment.classHead}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">Klassenleiter</p>
                                    <p className="font-semibold text-lg">{assignment.classLead}</p>
                                </div>
                                {scheduleTime && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-muted-foreground">Unterrichtszeit</p>
                                        <p className="font-semibold text-lg">
                                            {scheduleTime.startTime} - {scheduleTime.endTime}
                                        </p>
                                    </div>
                                )}
                                {breakTimes.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-muted-foreground">Pausenzeiten</p>
                                        <div className="space-y-1">
                                            {breakTimes.map((breakTime) => (
                                                <p key={breakTime.id} className="font-semibold text-sm">
                                                    {breakTime.name.replace(/\s*\d+$/, '')}: {breakTime.startTime} - {breakTime.endTime}
                                               
                                                </p>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {assignment.period === 'PM' &&
                                    (assignment.pmTrack === 'A' || assignment.pmTrack === 'B') && (
                                    <div className="space-y-2 col-span-2">
                                        <p className="text-sm text-muted-foreground">NM-Rhythmus</p>
                                        <p className="font-semibold text-lg">Spur {assignment.pmTrack}</p>
                                    </div>
                                )}
                            </div>
                            <div className="border-t border-border/70 pt-4 mt-4">
                                <p className="text-sm text-muted-foreground mb-2">Zusätzliche Informationen</p>
                                <p className="font-semibold text-lg">
                                    {scheduleData.schedules
                                        .find(sList => sList.some(s => Number(s.classId) === assignment.classId))
                                        ?.at(0)?.additionalInfo ?? '—'}
                                </p>
                            </div>

                            <div className="border-t border-border/70 pt-4 mt-4">
                                <p className="text-sm text-muted-foreground mb-2">Andere Gruppen</p>
                                {otherGroups.length === 0 ? (
                                    <p className="font-semibold text-lg">—</p>
                                ) : (
                                    <div className="space-y-2">
                                        {otherGroups.map(other => (
                                            <div key={other.id} className="p-2 bg-muted rounded grid grid-cols-3 gap-2 text-sm">
                                                <span>Gruppe {other.actualGroupId}</span>
                                                <span>{getTeacherDisplayName(other)}</span>
                                                <span>{other.roomName ?? '—'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            
                            <div className="border-t border-border/70 pt-4 mt-4">
                                <p className="text-sm text-muted-foreground mb-2">Schüler in {assignment.period}-Gruppe</p>
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
                                                        <div key={student.id} className="p-2 bg-muted rounded flex items-center gap-2">
                                                            <span className="text-muted-foreground text-xs shrink-0">{index + 1}.</span>
                                                            <StudentPhoto
                                                                studentId={student.id}
                                                                firstName={student.firstName}
                                                                lastName={student.lastName}
                                                                size={28}
                                                                nameFormat="firstLast"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="space-y-2">
                                                    {rightColumnStudents.map((student, index) => (
                                                        <div key={student.id} className="p-2 bg-muted rounded flex items-center gap-2">
                                                            <span className="text-muted-foreground text-xs shrink-0">{index + 7}.</span>
                                                            <StudentPhoto
                                                                studentId={student.id}
                                                                firstName={student.firstName}
                                                                lastName={student.lastName}
                                                                size={28}
                                                                nameFormat="firstLast"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>
                        </TeacherAssignmentReveal>
                    )
                })}
            </div>
        )
    }

    return (
        <Tabs defaultValue={`${today === 0 || today === 6 ? 1 : today}`} className="w-full" onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-5 bg-muted">
                <TabsTrigger value="1" className="data-[state=active]:bg-card">Montag</TabsTrigger>
                <TabsTrigger value="2" className="data-[state=active]:bg-card">Dienstag</TabsTrigger>
                <TabsTrigger value="3" className="data-[state=active]:bg-card">Mittwoch</TabsTrigger>
                <TabsTrigger value="4" className="data-[state=active]:bg-card">Donnerstag</TabsTrigger>
                <TabsTrigger value="5" className="data-[state=active]:bg-card">Freitag</TabsTrigger>
            </TabsList>
            <TabsContent value="1" className="mt-4">
                {error ? (
                    <div className="p-4 state-warning-soft rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            <p>{error}</p>
                        </div>
                    </div>
                ) : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="2" className="mt-4">
                {error ? (
                    <div className="p-4 state-warning-soft rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            <p>{error}</p>
                        </div>
                    </div>
                ) : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="3" className="mt-4">
                {error ? (
                    <div className="p-4 state-warning-soft rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            <p>{error}</p>
                        </div>
                    </div>
                ) : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="4" className="mt-4">
                {error ? (
                    <div className="p-4 state-warning-soft rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            <p>{error}</p>
                        </div>
                    </div>
                ) : renderScheduleInfo()}
            </TabsContent>
            <TabsContent value="5" className="mt-4">
                {error ? (
                    <div className="p-4 state-warning-soft rounded-lg shadow-sm">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            <p>{error}</p>
                        </div>
                    </div>
                ) : renderScheduleInfo()}
            </TabsContent>
        </Tabs>
    )
}

