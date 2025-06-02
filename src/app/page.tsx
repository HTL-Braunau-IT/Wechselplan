'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSession, signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogIn } from 'lucide-react'
import React from 'react'

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
  classId: number;
  students: Student[];
}

interface GroupAssignment {
  groupId: number;
  studentIds: number[];
}

interface GroupAssignmentsResponse {
  assignments: GroupAssignment[];
}

interface TeacherAssignmentResponse {
  groupId: number;
  teacherId: number;
  classId: number;
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

interface StudentClassResponse {
  class: string;
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
  const { data: session, status } = useSession()
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

  // Get current weekday (0-6, where 0 is Sunday)
  const currentWeekday = new Date().getDay()

  // Fetch classes on mount
  useEffect(() => {
    if (session?.user?.role === 'teacher') {
      void fetchAllClasses()
    } else if (session?.user?.role === 'student') {
      void fetchClasses()
    }
  }, [session?.user?.role])

  // Auto-select class for students
  useEffect(() => {
    if (session?.user?.role === 'student' && classes.length > 0) {
      const username = session.user.name
      console.log('Student username:', username)
      
      fetch(`/api/students/class?username=${username}`)
        .then(res => res.json())
        .then((data: StudentClassResponse) => {
          if (data.class) {
            console.log('Auto-selecting class for student:', data.class)
            setSelectedClass(data.class)
          } else {
            console.log('No class found for student')
          }
        })
        .catch(err => {
          console.error('Error fetching student class:', err)
        })
    }
  }, [session?.user?.role, session?.user?.name, classes])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/classes')
      if (!response.ok) throw new Error('Failed to fetch classes')
      const data = await response.json() as Class[]
      setClasses(data)
    } catch (err) {
      console.error('Error fetching classes:', err)
      setError('Failed to load classes')
    } finally {
      setLoading(false)
    }
  }

  const fetchAllClasses = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/classes')
      if (!response.ok) throw new Error('Failed to fetch classes')
      const data = await response.json() as Class[]
      setClasses(data)
      
      // First get the teacher's ID
      const teachersRes = await fetch('/api/teachers')
      if (!teachersRes.ok) throw new Error('Failed to fetch teachers')
      const teachers = await teachersRes.json() as Teacher[]
      const teacher = teachers.find(t => `${t.lastName} ${t.firstName}` === session?.user?.name)
      
      if (!teacher) {
        throw new Error('Teacher not found')
      }

      console.log('Found teacher:', teacher)

      // Fetch teacher assignments for all classes
      const teacherAssignmentsPromises = data.map(async (classItem) => {
        const res = await fetch(`/api/schedule/teacher-assignments?class=${classItem.name}`)
        if (!res.ok) return null
        const assignments = await res.json() as TeacherAssignmentsResponse
        return { classId: classItem.id, assignments }
      })

      const teacherAssignmentsResults = await Promise.all(teacherAssignmentsPromises)
      const teacherAssignments = teacherAssignmentsResults.filter(Boolean) as { classId: number, assignments: TeacherAssignmentsResponse }[]

      console.log('Teacher assignments:', teacherAssignments)

      // Combine all assignments
      const allAmAssignments = teacherAssignments.flatMap(ta => ta.assignments.amAssignments.map(a => ({ ...a, classId: ta.classId })))
      const allPmAssignments = teacherAssignments.flatMap(ta => ta.assignments.pmAssignments.map(a => ({ ...a, classId: ta.classId })))

      // Filter assignments for current teacher
      const teacherAmAssignments = allAmAssignments.filter(a => a.teacherId === teacher.id)
      const teacherPmAssignments = allPmAssignments.filter(a => a.teacherId === teacher.id)

      console.log('Filtered teacher assignments:', { am: teacherAmAssignments, pm: teacherPmAssignments })

      // Get unique class IDs from teacher's assignments
      const classIds = new Set([
        ...teacherAmAssignments.map(a => a.classId),
        ...teacherPmAssignments.map(a => a.classId)
      ])

      console.log('Class IDs:', Array.from(classIds))

      // Fetch schedules for classes where the teacher has assignments
      const schedulePromises = Array.from(classIds).map(async (classId) => {
        const className = data.find(c => c.id === classId)?.name
        if (!className) return null
        const scheduleRes = await fetch(`/api/schedules?class=${className}`)
        if (!scheduleRes.ok) return null
        const schedules = await scheduleRes.json() as Schedule[]
        return { classId, schedules }
      })

      const classSchedules = await Promise.all(schedulePromises)
      const validSchedules = classSchedules.filter(Boolean) as { classId: number, schedules: Schedule[] }[]
      
      console.log('Valid schedules:', validSchedules)

      // Filter schedules to only show those for the current weekday
      const filteredSchedules = validSchedules.map(({ classId, schedules }) => ({
        classId,
        schedules: schedules.filter(schedule => {
          const scheduleData = Object.values(schedule.scheduleData)[0]
          return scheduleData?.weeks?.some(week => {
            const weekDate = new Date(week.date)
            return weekDate.getDay() === currentWeekday
          })
        })
      })).filter(({ schedules }) => schedules.length > 0)

      console.log('Filtered schedules:', filteredSchedules)

      // Create groups for each class
      const groups = Array.from(classIds).flatMap(classId => {
        // Create 4 groups for each class (1-4)
        return [1, 2, 3, 4].map(groupNumber => ({
          id: groupNumber,
          classId: classId,
          students: [] // We don't need student data for teachers
        }));
      });

      // Fetch students for each group
      const groupAssignmentsPromises = Array.from(classIds).map(async (classId) => {
        const className = data.find(c => c.id === classId)?.name;
        if (!className) return null;
        const res = await fetch(`/api/schedule/assignments?class=${className}`);
        if (!res.ok) return null;
        const assignments = await res.json() as GroupAssignmentsResponse;
        return { classId, assignments };
      });

      const groupAssignmentsResults = await Promise.all(groupAssignmentsPromises);
      const groupAssignments = groupAssignmentsResults.filter(Boolean) as { classId: number, assignments: GroupAssignmentsResponse }[];

      // Fetch students for each class
      const studentsPromises = Array.from(classIds).map(async (classId) => {
        const className = data.find(c => c.id === classId)?.name;
        if (!className) return null;
        const res = await fetch(`/api/students?class=${className}`);
        if (!res.ok) return null;
        const students = await res.json() as Student[];
        return { classId, students };
      });

      const studentsResults = await Promise.all(studentsPromises);
      const classStudents = studentsResults.filter(Boolean) as { classId: number, students: Student[] }[];

      // Update groups with student data
      const groupsWithStudents = groups.map(group => {
        const groupAssignment = groupAssignments.find(ga => ga.classId === group.classId);
        const classStudentData = classStudents.find(cs => cs.classId === group.classId);
        if (!groupAssignment || !classStudentData) return group;

        const students = groupAssignment.assignments.assignments
          .find(a => a.groupId === group.id)
          ?.studentIds.map(studentId => classStudentData.students.find(s => s.id === studentId))
          .filter(Boolean) as Student[];

        return {
          ...group,
          students: students || []
        };
      });

      const flatSchedules = filteredSchedules.flatMap(({ schedules }) => schedules)
      console.log('Setting schedules:', flatSchedules)
      setSchedules(flatSchedules)
      console.log('Setting groups:', groupsWithStudents)
      setGroups(groupsWithStudents)
      console.log('Setting AM assignments:', teacherAmAssignments)
      setAmAssignments(teacherAmAssignments)
      console.log('Setting PM assignments:', teacherPmAssignments)
      setPmAssignments(teacherPmAssignments)
      console.log('Setting teachers:', teachers)
      setTeachers(teachers)

      // Fetch schedule times for the first class (they should be the same for all classes)
      if (classIds.size > 0) {
        const firstClassId = Array.from(classIds)[0]
        const className = data.find(c => c.id === firstClassId)?.name
        if (!className) {
          throw new Error('Class name not found')
        }

        const timesRes = await fetch(`/api/schedules/times?class=${className}`)
        if (timesRes.ok) {
          const timesData = await timesRes.json() as { scheduleTimes: ScheduleTime[], breakTimes: BreakTime[] }
          console.log('Setting schedule times:', timesData.scheduleTimes)
          setScheduleTimes(timesData.scheduleTimes)
          console.log('Setting break times:', timesData.breakTimes)
          setBreakTimes(timesData.breakTimes)
        }

        // Fetch turns for the first class
        const turnsRes = await fetch(`/api/schedules?class=${className}`)
        if (turnsRes.ok) {
          const turnsData = await turnsRes.json() as TurnSchedule
          console.log('Setting turns:', turnsData)
          setTurns(turnsData)
        }
      }
    } catch (err) {
      console.error('Error fetching all classes:', err)
      setError('Failed to load classes')
    } finally {
      setLoading(false)
    }
  }

  // Fetch all data when class is selected (for students)
  useEffect(() => {
    if (selectedClass && session?.user?.role === 'student') {
      void fetchAll()
    }
  }, [selectedClass, session?.user?.role])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [schedulesRes, groupsRes, amAssignmentsRes, pmAssignmentsRes, scheduleTimesRes, breakTimesRes, turnsRes, teachersRes] = await Promise.all([
        fetch(`/api/schedules?classId=${selectedClass}`),
        fetch(`/api/schedule/assignments?class=${selectedClass}`),
        fetch(`/api/schedule/teacher-assignments?class=${selectedClass}`),
        fetch(`/api/schedule/teacher-assignments?class=${selectedClass}`),
        fetch(`/api/schedules/times?class=${selectedClass}`),
        fetch(`/api/schedules/times?class=${selectedClass}`),
        fetch(`/api/schedules?classId=${selectedClass}`),
        fetch(`/api/teachers?class=${selectedClass}`),
      ])

      if (!schedulesRes.ok) throw new Error('Failed to fetch schedules')
      if (!groupsRes.ok) throw new Error('Failed to fetch groups')
      if (!amAssignmentsRes.ok) throw new Error('Failed to fetch AM assignments')
      if (!pmAssignmentsRes.ok) throw new Error('Failed to fetch PM assignments')
      if (!scheduleTimesRes.ok) throw new Error('Failed to fetch schedule times')
      if (!breakTimesRes.ok) throw new Error('Failed to fetch break times')
      if (!turnsRes.ok) throw new Error('Failed to fetch turns')
      if (!teachersRes.ok) throw new Error('Failed to fetch teachers')

      const [schedules, groupAssignments, amAssignments, pmAssignments, timesData, breakTimesData, turns, teachers] = await Promise.all([
        schedulesRes.json() as Promise<Schedule[]>,
        groupsRes.json() as Promise<GroupAssignmentsResponse>,
        amAssignmentsRes.json() as Promise<TeacherAssignmentsResponse>,
        pmAssignmentsRes.json() as Promise<TeacherAssignmentsResponse>,
        scheduleTimesRes.json() as Promise<{ scheduleTimes: ScheduleTime[], breakTimes: BreakTime[] }>,
        breakTimesRes.json() as Promise<{ scheduleTimes: ScheduleTime[], breakTimes: BreakTime[] }>,
        turnsRes.json() as Promise<TurnSchedule>,
        teachersRes.json() as Promise<Teacher[]>,
      ])

      // Convert group assignments to groups with students
      const groupsWithStudents = groupAssignments.assignments.map(assignment => ({
        id: assignment.groupId,
        classId: assignment.groupId,
        students: assignment.studentIds.map(id => ({
          id,
          firstName: '', // These will be populated from the students API
          lastName: '',
          class: selectedClass
        }))
      }));

      setSchedules(schedules)
      setGroups(groupsWithStudents)
      setAmAssignments(amAssignments.amAssignments)
      setPmAssignments(pmAssignments.pmAssignments)
      setScheduleTimes(timesData.scheduleTimes)
      setBreakTimes(timesData.breakTimes)
      setTurns(turns)
      setTeachers(teachers)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

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
  function getGroupForTeacherAndTurn(teacherIdx: number, turnIdx: number, period: 'AM' | 'PM'): Group | null {
    const teacherList = period === 'AM' ? uniqueAmTeachers : uniquePmTeachers;
    if (!teacherList[teacherIdx]) return null;

    // Get the assignment for this teacher and period
    const teacher = teacherList[teacherIdx];
    if (!teacher) return null;

    // Find the assignment for this teacher in the current period
    const assignment = period === 'AM' 
      ? amAssignments.find(a => a.teacherId === teacher.id)
      : pmAssignments.find(a => a.teacherId === teacher.id);

    console.log(`${period} assignment for teacher ${teacher.id}:`, assignment);

    // If there's an assignment, use its group
    if (assignment) {
      // Find the group that matches both the assignment's groupId and classId
      const assignedGroup = groups.find(g => g.id === assignment.groupId && g.classId === assignment.classId);
      console.log(`${period} assigned group:`, assignedGroup);
      if (assignedGroup) {
        return assignedGroup;
      }
    }

    // If no assignment, use the rotated group list
    const currentClassId = period === 'AM' ? amAssignments[0]?.classId : pmAssignments[0]?.classId;
    console.log(`${period} current class ID:`, currentClassId);
    const groupList = groups.filter(g => g.classId === currentClassId);
    console.log(`${period} group list:`, groupList);
    if (!groupList[0]) return null;

    // Check if current date is in any schedule's range
    const currentDate = new Date();
    const isInScheduleRange = schedules.some(schedule => {
      const scheduleData = Object.values(schedule.scheduleData)[0];
      return scheduleData?.weeks?.some(week => {
        const weekDate = new Date(week.date);
        return weekDate.getDay() === currentWeekday;
      });
    });

    // If not in schedule range, use first term's groups (turnIdx = 0)
    const effectiveTurnIdx = isInScheduleRange ? turnIdx : 0;
    const rotatedGroups = rotateArray(groupList, effectiveTurnIdx);
    return rotatedGroups[teacherIdx] ?? null;
  }

  // Find the max number of students in any group for row rendering
  const maxStudents = Math.max(...groups.map(g => g.students.length), 0);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-lg">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">{t('common.welcome')}</h1>
          <p className="text-lg text-muted-foreground">{t('auth.pleaseLogin')}</p>
          <Button onClick={() => signIn()} size="lg" className="mt-4">
            <LogIn className="mr-2 h-5 w-5" />
            {t('auth.login')}
          </Button>
        </div>
      </div>
    )
  }

  if (loading && !selectedClass) return <div className="p-8 text-center">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  const uniqueSchedules = getUniqueSchedules(schedules)
  console.log('Rendering with schedules:', schedules)
  console.log('Unique schedules:', uniqueSchedules)
  console.log('Groups:', groups)
  console.log('AM assignments:', amAssignments)
  console.log('PM assignments:', pmAssignments)
  console.log('Teachers:', teachers)
  console.log('Schedule times:', scheduleTimes)
  console.log('Turns:', turns)

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="z-10 max-w-5xl w-full space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-bold mb-8">{t('common.welcome')}</h1>
          <div className="text-sm text-gray-500">
            <div>Version: {process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}</div>
            <div>Build: {process.env.NEXT_PUBLIC_BUILD_DATE ? new Date(process.env.NEXT_PUBLIC_BUILD_DATE).toLocaleDateString() : 'N/A'}</div>
          </div>
        </div>
        
        {/* Only show class selector for students */}
        {session.user?.role === 'student' && (
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
        )}

        {/* Display schedules for the current weekday */}
        {(schedules.length > 0 || amAssignments.length > 0 || pmAssignments.length > 0) && (
          <>
            {/* AM and PM Schedule Tables */}
            {[{ period: 'AM', teachers: uniqueAmTeachers }, { period: 'PM', teachers: uniquePmTeachers }].map(({ period, teachers }) => (
              <Card className="mb-8" key={period}>
                <CardHeader>
                  <CardTitle>{new Date().toLocaleDateString('de-DE', { weekday: 'long' })} ({period})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border text-sm">
                      <thead>
                        <tr>
                          <th colSpan={4 + Object.keys(turns).length} className="border p-2 bg-gray-100">
                            <div className="text-lg font-bold">
                              {period === 'AM' 
                                ? classes.find(c => c.id === amAssignments[0]?.classId)?.name 
                                : classes.find(c => c.id === pmAssignments[0]?.classId)?.name}
                            </div>
                          </th>
                        </tr>
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
                          <React.Fragment key={teacher.id}>
                            <tr>
                              <td className="border p-2 font-medium">{teacher.lastName}, {teacher.firstName}</td>
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
                            {/* Current Group and Students */}
                            {(() => {
                              const currentGroup = getGroupForTeacherAndTurn(teacherIdx, 0, period as 'AM' | 'PM');
                              if (currentGroup && currentGroup.students.length > 0) {
                                return (
                                  <tr key={`${teacher.id}-students`}>
                                    <td colSpan={4 + Object.keys(turns).length} className="border p-2 bg-gray-50">
                                      <div className="text-sm">
                                        <span className="font-medium">Aktuelle Gruppe {currentGroup.id}:</span>
                                        <ul className="mt-1 list-disc list-inside">
                                          {currentGroup.students.map(student => (
                                            <li key={student.id} className="text-gray-600">
                                              {student.lastName}, {student.firstName}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }
                              return null;
                            })()}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Schedule Overview */}
            {schedules.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Übersicht</CardTitle>
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
                    <div className="text-center text-gray-500">No schedules found for today</div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </main>
  )
}
