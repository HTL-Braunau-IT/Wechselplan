'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

/**
 * Displays an overview of schedules and classes, allowing users to filter by class and view detailed group and teacher assignment tables.
 *
 * Fetches schedule and class data, manages loading and error states, and renders group overviews and AM/PM teacher assignment tables for the selected class. Provides a dropdown to select a class and conditionally displays detailed tables when a specific class is chosen.
 */
export default function SchedulesPage() {
  const [, setSchedules] = useState<Schedule[]>([])
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
    turns,
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

  if (loading || isLoadingCachedData || overviewLoading) return <div className="p-8 text-center">Loading...</div>
  if (error ?? overviewError) return <div className="p-8 text-center text-red-500">{error ?? overviewError}</div>

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
             
            </div>
          </>
        )}
      </div>
    </div>
  )
} 