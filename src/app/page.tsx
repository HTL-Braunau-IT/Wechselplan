'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Week {
  week: string;
  date: string;
  isHoliday: boolean;
}

interface Holiday {
  name: string;
  startDate: string;
  endDate: string;
}

interface ScheduleData {
  weeks: Week[];
  holidays: Holiday[];
}

interface Schedule {
  id: number;
  name: string;
  createdAt: string;
  scheduleData: Record<string, ScheduleData>;
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

type TurnSchedule = Record<string, unknown>

interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
}

interface Class {
  id: number;
  name: string;
  description: string | null;
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

export default function Home() {
  const { t } = useTranslation()
  const [classes, setClasses] = useState<Class[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [amAssignments, setAmAssignments] = useState<TeacherAssignmentResponse[]>([])
  const [pmAssignments, setPmAssignments] = useState<TeacherAssignmentResponse[]>([])
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([])
  const [, setBreakTimes] = useState<BreakTime[]>([])
  const [turns, setTurns] = useState<TurnSchedule>({})
  const [teachers, setTeachers] = useState<Teacher[]>([])

  useEffect(() => {
    void fetchClasses()
  }, [])

  useEffect(() => {
    if (selectedClass) {
      void fetchAll()
    }
  }, [selectedClass])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/classes')
      if (!response.ok) throw new Error('Failed to fetch classes')
      const data = await response.json() as Class[]
      console.log('Raw classes data:', data) // Debug log
      setClasses(data)
    } catch (err) {
      console.error('Error fetching classes:', err) // Debug log
      setError('Failed to load classes')
    } finally {
      setLoading(false)
    }
  }

  const fetchAll = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch teachers
      const teachersRes = await fetch('/api/teachers');
      if (!teachersRes.ok) throw new Error('Failed to fetch teachers');
      const teachersData = await teachersRes.json() as Teacher[];
      setTeachers(teachersData);
      // Fetch all students for the class
      const studentsRes = await fetch(`/api/students?class=${selectedClass}`);
      if (!studentsRes.ok) throw new Error('Failed to fetch students');
      const students: Student[] = await studentsRes.json();
      // Fetch group assignments
      const groupRes = await fetch(`/api/schedule/assignments?class=${selectedClass}`);
      if (!groupRes.ok) throw new Error('Failed to fetch group assignments');
      const groupData: { assignments: { groupId: number; studentIds: number[] }[] } = await groupRes.json();
      setGroups(
        groupData.assignments.map((g) => ({
          id: g.groupId,
          students: g.studentIds.map(id => students.find(s => s.id === id)).filter(Boolean) as Student[]
        }))
      );
      // Fetch teacher assignments
      const teacherRes = await fetch(`/api/schedule/teacher-assignments?class=${selectedClass}`);
      if (!teacherRes.ok) throw new Error('Failed to fetch teacher assignments');
      const teacherData: TeacherAssignmentsResponse = await teacherRes.json();
      setAmAssignments(teacherData.amAssignments);
      setPmAssignments(teacherData.pmAssignments);
      // Fetch selected schedule times
      const timesRes = await fetch(`/api/schedules/times?class=${selectedClass}`);
      if (!timesRes.ok) throw new Error('Failed to fetch schedule times');
      const timesData: { scheduleTimes?: ScheduleTime[]; breakTimes?: BreakTime[] } = await timesRes.json();
      setScheduleTimes(timesData.scheduleTimes ?? []);
      setBreakTimes(timesData.breakTimes ?? []);
      // Fetch rotation/turn schedule
      const schedulesRes = await fetch(`/api/schedules?classId=${selectedClass}`);
      if (!schedulesRes.ok) throw new Error('Failed to fetch rotation schedule');
      const schedules = await schedulesRes.json() as Schedule[];
      setSchedules(schedules);
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

  // Helper function to get unique schedules based on their data
  const getUniqueSchedules = (schedules: Schedule[]): Schedule[] => {
    const uniqueSchedules = new Map<string, Schedule>();
    
    schedules.forEach(schedule => {
      // Create a key based on the schedule data
      const scheduleKey = JSON.stringify(schedule.scheduleData);
      
      // Only add if we haven't seen this schedule data before
      if (!uniqueSchedules.has(scheduleKey)) {
        uniqueSchedules.set(scheduleKey, schedule);
      }
    });
    
    return Array.from(uniqueSchedules.values());
  };

  // Helper: round-robin rotate an array by n positions
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

  // Get unique teachers for AM and PM (in assignment order)
  const uniqueAmTeachers = amAssignments
    .map(a => a.teacherId)
    .filter((id, idx, arr) => arr.indexOf(id) === idx && id !== 0)
    .map(id => teachers.find(t => t.id === id))
    .filter(Boolean) as Teacher[];
  const uniquePmTeachers = pmAssignments
    .map(a => a.teacherId)
    .filter((id, idx, arr) => arr.indexOf(id) === idx && id !== 0)
    .map(id => teachers.find(t => t.id === id))
    .filter(Boolean) as Teacher[];

  // Helper: get turnus info (start, end, days) from turns
  function getTurnusInfo(turnKey: string) {
    const entry = turns[turnKey] as { weeks?: { date: string }[] };
    if (!entry?.weeks?.length) return { start: '', end: '', days: 0 };
    const start = entry.weeks[0]?.date ?? '';
    const end = entry.weeks[entry.weeks.length - 1]?.date ?? '';
    const days = entry.weeks.length;
    return { start, end, days };
  }

  // Helper: get weekday from first turn (dynamic)
  function getWeekday() {
    // Try to get from scheduleTimes, fallback to Montag
    if (scheduleTimes.length > 0) {
      const first = scheduleTimes[0];
      // Try to parse weekday from startTime (if possible)
      // Otherwise fallback
      return first?.startTime ? new Date(`1970-01-01T${first.startTime}`).toLocaleDateString('de-DE', { weekday: 'long' }) : 'Montag';
    }
    return 'Montag';
  }

  // Helper: get assignment for a teacher, group, and period
  function getAssignment(teacherId: number, groupId: number, period: 'AM' | 'PM') {
    const assignments = period === 'AM' ? amAssignments : pmAssignments;
    return assignments.find(a => a.teacherId === teacherId && a.groupId === groupId);
  }

  // Helper: for a given teacher and turn, find the group assigned in the round-robin
  function getGroupForTeacherAndTurn(teacherIdx: number, turnIdx: number, period: 'AM' | 'PM') {
    const groupList = groups;
    const teacherList = period === 'AM' ? uniqueAmTeachers : uniquePmTeachers;
    if (!groupList[0] || !teacherList[teacherIdx]) return null;
    // For each turn, rotate the group list
    const rotatedGroups = rotateArray(groupList, turnIdx);
    const group = rotatedGroups[teacherIdx];
    return group;
  }

  // Find the max number of students in any group for row rendering
  const maxStudents = Math.max(...groups.map(g => g.students.length), 0);

  if (loading && !selectedClass) return <div className="p-8 text-center">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  const uniqueSchedules = getUniqueSchedules(schedules);

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="z-10 max-w-5xl w-full space-y-8">
        <h1 className="text-4xl font-bold mb-8">{t('common.welcome')}</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Select Class</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes && classes.length > 0 ? (
                  classes.map((classItem) => (
                    <SelectItem 
                      key={`class-${classItem.id}`}
                      value={classItem.name}
                    >
                      {classItem.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-classes" disabled>
                    No classes available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {classes.length === 0 && !loading && (
              <p className="mt-2 text-sm text-gray-500">No classes found</p>
            )}
          </CardContent>
        </Card>

        {selectedClass && (
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
                            <td key={`${rowIdx}-${group.id}`} className="border p-2 text-center">
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
                        {teachers.map((teacher, teacherIdx) => (
                          <tr key={teacher.id}>
                            <td className="border p-2 font-medium">{teacher.lastName}, {teacher.firstName}</td>
                            {/* Werkstätte, Lehrinhalt, Raum: show for first group in first turn, or blank if not found */}
                            {(() => {
                              const group = getGroupForTeacherAndTurn(teacherIdx, 0, period as 'AM' | 'PM');
                              const assignment = group ? getAssignment(teacher.id, group.id, period as 'AM' | 'PM') : null;
                              return [
                                <td className="border p-2" key={`${teacher.id}-subject`}>{assignment?.subject ?? ''}</td>,
                                <td className="border p-2" key={`${teacher.id}-learningContent`}>{assignment?.learningContent ?? ''}</td>,
                                <td className="border p-2" key={`${teacher.id}-room`}>{assignment?.room ?? ''}</td>,
                              ];
                            })()}
                            {Object.keys(turns).map((turn, turnIdx) => {
                              const group = getGroupForTeacherAndTurn(teacherIdx, turnIdx, period as 'AM' | 'PM');
                              return (
                                <td
                                  key={`${teacher.id}-${turn}-${turnIdx}`}
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

            {/* Schedule Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Schedule Overview</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center">Loading schedules...</div>
                ) : uniqueSchedules.length > 0 ? (
                  <div className="space-y-4">
                    {uniqueSchedules.map((schedule, scheduleIndex) => (
                      <Card key={`schedule-${schedule?.id ?? scheduleIndex}`}>
                        <CardHeader>
                          <CardTitle>{schedule?.name ?? 'Unnamed Schedule'}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr>
                                  {Object.entries(schedule?.scheduleData ?? {}).map(([turnus, entry], turnusIndex) => (
                                    <th key={`turnus-${turnus}-${turnusIndex}`} className="border p-2">
                                      <div>{turnus}</div>
                                      <div className="text-sm font-normal text-gray-500">
                                        {entry?.weeks?.length ?? 0} weeks
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {Object.values(schedule?.scheduleData ?? {})[0]?.weeks?.map((_, weekIndex: number) => (
                                  <tr key={`week-${weekIndex}`}>
                                    {Object.values(schedule?.scheduleData ?? {}).map((entry, turnusIndex) => (
                                      <td key={`cell-${weekIndex}-${turnusIndex}`} className="border p-2">
                                        {entry?.weeks?.[weekIndex] && (
                                          <>
                                            {entry.weeks[weekIndex].week}
                                            <br />
                                            <span className={entry.weeks[weekIndex].isHoliday ? 'text-red-500' : undefined}>
                                              {entry.weeks[weekIndex].date}
                                            </span>
                                          </>
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500">No schedules found for this class</div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  )
}
