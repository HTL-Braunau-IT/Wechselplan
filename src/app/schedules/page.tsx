'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCachedData } from '@/hooks/use-cached-data'

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
}

interface Class {
  id: number
  name: string
  description: string | null
}

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  class: string;
}

interface Group {
  id: number;
  students: Student[];
}

interface TeacherAssignmentResponse {
  groupId: number;
  teacherId: number;
  subject: string;
  learningContent: string;
  room: string;
  teacherLastName: string;
  teacherFirstName: string;
}

interface TeacherAssignmentsResponse {
  amAssignments: TeacherAssignmentResponse[];
  pmAssignments: TeacherAssignmentResponse[];
}

interface ScheduleTime {
  id: string;
  startTime: string;
  endTime: string;
  hours: number;
  period: 'AM' | 'PM';
}

interface BreakTime {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  period: 'AM' | 'PM';
}

type TurnSchedule = Record<string, unknown>;

const GROUP_COLORS = [
  'bg-yellow-200', // Gruppe 1
  'bg-green-200',  // Gruppe 2
  'bg-blue-200',   // Gruppe 3
  'bg-red-200',    // Gruppe 4
];

const DARK_GROUP_COLORS = [
  'dark:bg-yellow-900/60',
  'dark:bg-green-900/60',
  'dark:bg-blue-900/60',
  'dark:bg-red-900/60',
];

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [groups, setGroups] = useState<Group[]>([])
  const [amAssignments, setAmAssignments] = useState<TeacherAssignmentResponse[]>([])
  const [pmAssignments, setPmAssignments] = useState<TeacherAssignmentResponse[]>([])
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [, setBreakTimes] = useState<BreakTime[]>([])
  const [turns, setTurns] = useState<TurnSchedule>({})
  const { teachers, isLoading: isLoadingCachedData } = useCachedData()

  useEffect(() => {
    void fetchData()
  }, [])

  useEffect(() => {
    const classParam = searchParams.get('class')
    if (classParam) {
      setSelectedClass(classParam)
    }
  }, [searchParams])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch all schedules
      const schedulesRes = await fetch('/api/schedules')
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

  const filteredSchedules = selectedClass === 'all'
    ? schedules
    : schedules.filter(schedule => {
        const scheduleClass = classes.find(c => c.id === schedule.classId)
        return scheduleClass?.name === selectedClass
      })

  // Fetch detailed overview data when a class is selected
  useEffect(() => {
    if (selectedClass === 'all') return;
    if (!selectedClass) return;
    void fetchOverviewData(selectedClass);
  }, [selectedClass]);

  const fetchOverviewData = async (className: string) => {
    try {
      setLoading(true);
      setError(null);
      // Fetch all students for the class
      const studentsRes = await fetch(`/api/students?class=${encodeURIComponent(className)}`);
      if (!studentsRes.ok) throw new Error('Failed to fetch students');
      const students: Student[] = await studentsRes.json();
      // Fetch group assignments
      const groupRes = await fetch(`/api/schedule/assignments?class=${encodeURIComponent(className)}`);
      if (!groupRes.ok) throw new Error('Failed to fetch group assignments');
      const groupData: { assignments: { groupId: number; studentIds: number[] }[] } = await groupRes.json();
      setGroups(
        groupData.assignments.map((g) => ({
          id: g.groupId,
          students: g.studentIds.map(id => students.find(s => s.id === id)).filter(Boolean) as Student[]
        }))
      );
      // Fetch teacher assignments
      const teacherRes = await fetch(`/api/schedule/teacher-assignments?class=${encodeURIComponent(className)}`);
      if (!teacherRes.ok) throw new Error('Failed to fetch teacher assignments');
      const teacherData: TeacherAssignmentsResponse = await teacherRes.json();
      setAmAssignments(teacherData.amAssignments);
      setPmAssignments(teacherData.pmAssignments);
      // Fetch selected schedule times
      const timesRes = await fetch(`/api/schedules/times?class=${encodeURIComponent(className)}`);
      if (!timesRes.ok) throw new Error('Failed to fetch schedule times');
      const timesData: { scheduleTimes?: ScheduleTime[]; breakTimes?: BreakTime[] } = await timesRes.json();
      setScheduleTimes(timesData.scheduleTimes ?? []);
      setBreakTimes(timesData.breakTimes ?? []);
      // Fetch rotation/turn schedule
      const schedulesRes = await fetch(`/api/schedules?classId=${encodeURIComponent(className)}`);
      if (!schedulesRes.ok) throw new Error('Failed to fetch rotation schedule');
      const schedules = await schedulesRes.json();
      const latestSchedule = schedules[0];
      const scheduleData = latestSchedule?.scheduleData ?? {};
      setTurns(scheduleData as TurnSchedule);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to load overview data';
      setError(errMsg ?? 'Failed to load overview data');
    } finally {
      setLoading(false);
    }
  };

  // Helpers from overview/page.tsx
  function rotateArray<T>(arr: T[], n: number): T[] {
    const rotated = [...arr];
    for (let i = 0; i < n; i++) {
      const temp = rotated.shift();
      if (temp !== undefined) {
        rotated.push(temp);
      }
    }
    return rotated;
  }

  const uniqueAmTeachers = amAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);

  const uniquePmTeachers = pmAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);

  function getTurnusInfo(turnKey: string) {
    const entry = turns[turnKey] as { weeks?: { date: string }[] };
    if (!entry?.weeks?.length) return { start: '', end: '', days: 0 };
    const start = entry.weeks[0]?.date ?? '';
    const end = entry.weeks[entry.weeks.length - 1]?.date ?? '';
    const days = entry.weeks.length;
    return { start, end, days };
  }

  function getWeekday() {
    if (scheduleTimes.length > 0) {
      const first = scheduleTimes[0];
      return first?.startTime ? new Date(`1970-01-01T${first.startTime}`).toLocaleDateString('de-DE', { weekday: 'long' }) : 'Montag';
    }
    return 'Montag';
  }

  function getGroupForTeacherAndTurn(teacherIdx: number, turnIdx: number, period: 'AM' | 'PM') {
    const groupList = groups;
    const teacherList = period === 'AM' ? uniqueAmTeachers : uniquePmTeachers;
    if (!groupList[0] || !teacherList[teacherIdx]) return null;
    const rotatedGroups = rotateArray(groupList, turnIdx);
    const group = rotatedGroups[teacherIdx];
    return group;
  }

  const maxStudents = Math.max(...groups.map(g => g.students.length), 0);

  if (loading || isLoadingCachedData) return <div className="p-8 text-center">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

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
                <SelectItem key={cls.id} value={cls.name}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Only show detailed overview if a class is selected */}
        {selectedClass !== 'all' && (
          <>
            {/* Groups Table */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Gruppenübersicht</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full border text-sm">
                    <thead>
                      <tr>
                        {groups.map((group, idx) => (
                          <th
                            key={group.id}
                            className={`border p-2 text-center font-bold text-black ${GROUP_COLORS[idx % GROUP_COLORS.length]} ${DARK_GROUP_COLORS[idx % DARK_GROUP_COLORS.length]}`}
                          >
                            Gruppe {group.id}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...Array(maxStudents)].map((_, rowIdx) => (
                        <tr key={rowIdx}>
                          {groups.map((group) => (
                            <td key={group.id} className="border p-2 text-center">
                              {group.students[rowIdx]
                                ? `${group.students[rowIdx].lastName} ${group.students[rowIdx].firstName}`
                                : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* AM and PM Schedule Tables */}
            {[{ period: 'AM', teachers: uniqueAmTeachers }, { period: 'PM', teachers: uniquePmTeachers }].map(({ period, teachers }) => (
              <Card className="mb-8" key={period}>
                <CardHeader>
                  <CardTitle>{getWeekday()} ({period})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border text-sm">
                      <thead>
                        <tr>
                          <th className="border p-2">Lehrer/in</th>
                          <th className="border p-2">Werkstätte</th>
                          <th className="border p-2">Lehrinhalt</th>
                          <th className="border p-2">Raum</th>
                          {Object.keys(turns).map((turn, turnIdx) => (
                            <th key={turn} className="border p-2">
                              <div>Turnus {turnIdx + 1}</div>
                              <div className="text-xs text-gray-600">{getTurnusInfo(turn).start} - {getTurnusInfo(turn).end}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {teachers.map((assignment, teacherIdx) => (
                          <tr key={assignment.teacherId}>
                            <td className="border p-2 font-medium">{assignment.teacherLastName}, {assignment.teacherFirstName}</td>
                            <td className="border p-2">{assignment.subject ?? ''}</td>
                            <td className="border p-2">{assignment.learningContent ?? ''}</td>
                            <td className="border p-2">{assignment.room ?? ''}</td>
                            {Object.keys(turns).map((turn, turnIdx) => {
                              const group = getGroupForTeacherAndTurn(teacherIdx, turnIdx, period as 'AM' | 'PM');
                              return (
                                <td
                                  key={turn}
                                  className={`border p-2 text-center font-bold text-black ${group ? GROUP_COLORS[groups.findIndex(g => g.id === group.id) % GROUP_COLORS.length] : ''} ${group ? DARK_GROUP_COLORS[groups.findIndex(g => g.id === group.id) % DARK_GROUP_COLORS.length] : ''}`}
                                >
                                  {group ? group.id : ''}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
            <div className="flex justify-end mt-8">
              <button
                className="bg-primary text-primary-foreground px-6 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
                // onClick={handleSaveAndFinish} // Not needed for overview
                disabled={false}
              >
                Save & Finish
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
} 