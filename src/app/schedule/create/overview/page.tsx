'use client'

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCachedData } from '@/hooks/use-cached-data';

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

export default function OverviewPage() {
  const searchParams = useSearchParams();
  const classId = searchParams.get('class');
  const { teachers, isLoading: isLoadingCachedData } = useCachedData();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [amAssignments, setAmAssignments] = useState<TeacherAssignmentResponse[]>([]);
  const [pmAssignments, setPmAssignments] = useState<TeacherAssignmentResponse[]>([]);
  const [, setScheduleTimes] = useState<ScheduleTime[]>([]);
  const [, setBreakTimes] = useState<BreakTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnSchedule>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!classId) {
      setError('Class ID is required');
      setLoading(false);
      return;
    }
    void fetchAll();
  }, [classId]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch all students for the class
      const studentsRes = await fetch(`/api/students?class=${classId}`);
      if (!studentsRes.ok) throw new Error('Failed to fetch students');
      const students: Student[] = await studentsRes.json();
      // Fetch group assignments
      const groupRes = await fetch(`/api/schedule/assignments?class=${classId}`);
      if (!groupRes.ok) throw new Error('Failed to fetch group assignments');
      const groupData: { assignments: { groupId: number; studentIds: number[] }[] } = await groupRes.json();
      setGroups(
        groupData.assignments.map((g) => ({
          id: g.groupId,
          students: g.studentIds.map(id => students.find(s => s.id === id)).filter(Boolean) as Student[]
        }))
      );
      // Fetch teacher assignments
      const teacherRes = await fetch(`/api/schedule/teacher-assignments?class=${classId}`);
      if (!teacherRes.ok) throw new Error('Failed to fetch teacher assignments');
      const teacherData: TeacherAssignmentsResponse = await teacherRes.json();
      setAmAssignments(teacherData.amAssignments);
      setPmAssignments(teacherData.pmAssignments);
      // Fetch selected schedule times
      const timesRes = await fetch(`/api/schedules/times?class=${classId}`);
      if (!timesRes.ok) throw new Error('Failed to fetch schedule times');
      const timesData: { scheduleTimes?: ScheduleTime[]; breakTimes?: BreakTime[] } = await timesRes.json();
      setScheduleTimes(timesData.scheduleTimes ?? []);
      setBreakTimes(timesData.breakTimes ?? []);
      // Fetch rotation/turn schedule
      const schedulesRes = await fetch(`/api/schedules?classId=${classId}`);
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

  // Save handler for teacher rotation (if needed)
  async function handleSaveAndFinish() {
    setSaving(true);
    try {
      // Build round-robin teacher rotation for AM and PM
      const turnKeys = Object.keys(turns);
      const amRotation = groups.map((group, groupIdx) => ({
        groupId: group.id,
        turns: turnKeys.map((_, turnIdx) => {
          const teacherList = uniqueAmTeachers;
          const rotated = rotateArray(teacherList, turnIdx);
          const teacher = rotated[groupIdx];
          return teacher ? teacher.id : null;
        })
      }));
      const pmRotation = groups.map((group, groupIdx) => ({
        groupId: group.id,
        turns: turnKeys.map((_, turnIdx) => {
          const teacherList = uniquePmTeachers;
          const rotated = rotateArray(teacherList, turnIdx);
          const teacher = rotated[groupIdx];
          return teacher ? teacher.id : null;
        })
      }));
      // Save to backend
      await fetch('/api/schedule/teacher-rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          turns: turnKeys,
          amRotation,
          pmRotation
        })
      });
      router.push('/');
    } catch  {
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || isLoadingCachedData) return <div className="p-8 text-center">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  

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
    .filter(Boolean) as typeof teachers;
  const uniquePmTeachers = pmAssignments
    .map(a => a.teacherId)
    .filter((id, idx, arr) => arr.indexOf(id) === idx && id !== 0)
    .map(id => teachers.find(t => t.id === id))
    .filter(Boolean) as typeof teachers;

  // For each turn, rotate the teacher list and assign to groups


  // Helper: for a given teacher and turn, find the group assigned in the round-robin
  function getGroupForTeacherAndTurn(teacherIdx: number, turnIdx: number, period: 'AM' | 'PM') {
    const groupList = groups;
    const teacherList = period === 'AM' ? uniqueAmTeachers : uniquePmTeachers;
    if (!groupList[0] || !teacherList[teacherIdx]) return '';
    // For each turn, rotate the group list
    const rotatedGroups = rotateArray(groupList, turnIdx);
    const group = rotatedGroups[teacherIdx];
    return group ? `Gruppe ${group.id}` : '';
  }

  // Helper: get turnus info (start, end, days) from turns
  function getTurnusInfo(turnKey: string) {
    const entry = turns[turnKey] as { weeks?: { date: string }[] };
    if (!entry?.weeks?.length) return { start: '', end: '', days: 0 };
    const start = entry.weeks[0]?.date ?? '';
    const end = entry.weeks[entry.weeks.length - 1]?.date ?? '';
    const days = entry.weeks.length;
    return { start, end, days };
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 text-red-500 bg-red-50 rounded-md">
              {error}
            </div>
          )}
          {/* AM Rotation Table */}
          {uniqueAmTeachers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>AM Lehrer-Gruppen pro Turnus</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full border text-sm">
                    <thead>
                      <tr>
                        <th className="border p-2">Lehrer</th>
                        {Object.keys(turns).map(turn => (
                          <th key={turn} className="border p-2">{turn}</th>
                        ))}
                      </tr>
                      <tr>
                        <th className="border p-2"></th>
                        {Object.keys(turns).map(turn => {
                          const info = getTurnusInfo(turn);
                          return (
                            <th key={turn} className="border p-2 text-xs text-gray-600">
                              <div>Start: {info.start}</div>
                              <div>Ende: {info.end}</div>
                              <div>Tage: {info.days}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {uniqueAmTeachers.map((teacher, teacherIdx) => (
                        <tr key={teacher.id}>
                          <td className="border p-2">{teacher.lastName}, {teacher.firstName}</td>
                          {Object.keys(turns).map((turn, turnIdx) => (
                            <td key={turn} className="border p-2">{getGroupForTeacherAndTurn(teacherIdx, turnIdx, 'AM')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          {/* PM Rotation Table */}
          {uniquePmTeachers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>PM Lehrer-Gruppen pro Turnus</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full border text-sm">
                    <thead>
                      <tr>
                        <th className="border p-2">Lehrer</th>
                        {Object.keys(turns).map(turn => (
                          <th key={turn} className="border p-2">{turn}</th>
                        ))}
                      </tr>
                      <tr>
                        <th className="border p-2"></th>
                        {Object.keys(turns).map(turn => {
                          const info = getTurnusInfo(turn);
                          return (
                            <th key={turn} className="border p-2 text-xs text-gray-600">
                              <div>Start: {info.start}</div>
                              <div>Ende: {info.end}</div>
                              <div>Tage: {info.days}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {uniquePmTeachers.map((teacher, teacherIdx) => (
                        <tr key={teacher.id}>
                          <td className="border p-2">{teacher.lastName}, {teacher.firstName}</td>
                          {Object.keys(turns).map((turn, turnIdx) => (
                            <td key={turn} className="border p-2">{getGroupForTeacherAndTurn(teacherIdx, turnIdx, 'PM')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="flex justify-end mt-8">
            <button
              className="bg-primary text-primary-foreground px-6 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
              onClick={handleSaveAndFinish}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save & Finish'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
