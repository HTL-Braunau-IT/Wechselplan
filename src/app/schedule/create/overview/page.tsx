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

interface AssignmentsResponse {
  assignments: { groupId: number; students: Student[] }[];
}

interface TurnSchedule extends Record<string, unknown> {}

export default function OverviewPage() {
  const searchParams = useSearchParams();
  const classId = searchParams.get('class');
  const { rooms, subjects, learningContents, teachers, isLoading: isLoadingCachedData } = useCachedData();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [amAssignments, setAmAssignments] = useState<TeacherAssignmentResponse[]>([]);
  const [pmAssignments, setPmAssignments] = useState<TeacherAssignmentResponse[]>([]);
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([]);
  const [breakTimes, setBreakTimes] = useState<BreakTime[]>([]);
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
      const scheduleData = latestSchedule?.scheduleData || {};
      setTurns(scheduleData);
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
    } catch (e) {
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || isLoadingCachedData) return <div className="p-8 text-center">Loading...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  const maxGroupLength = groups.length > 0 ? Math.max(...groups.map(g => (g.students ? g.students.length : 0))) : 0;

  // Helper: round-robin rotate an array by n positions
  function rotateArray<T>(arr: T[], n: number): T[] {
    const len = arr.length;
    return Array.from({ length: len }, (_, i) => arr[(i + n) % len]);
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
  function getRotatedTeacherName(groupIdx: number, turnIdx: number, period: 'AM' | 'PM') {
    const teacherList = period === 'AM' ? uniqueAmTeachers : uniquePmTeachers;
    if (!teacherList[groupIdx]) return '';
    // For each turn, rotate by turnIdx
    const rotated = rotateArray(teacherList, turnIdx);
    const teacher = rotated[groupIdx];
    return teacher ? `${teacher.lastName}, ${teacher.firstName}` : '';
  }

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
    const entry = (turns as any)[turnKey];
    if (!entry || !entry.weeks || entry.weeks.length === 0) return { start: '', end: '', days: 0 };
    const start = entry.weeks[0]?.date || '';
    const end = entry.weeks[entry.weeks.length - 1]?.date || '';
    const days = entry.weeks.length;
    return { start, end, days };
  }

  return (
    <div className="container mx-auto p-4 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Klasse: <span className="font-bold">{classId}</span></CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Group Table */}
            <div>
              <h2 className="text-lg font-semibold mb-2">Gruppen</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full border text-sm">
                  <thead>
                    <tr>
                      {groups.map(group => (
                        <th key={group.id} className="border p-2 bg-gray-100">Gruppe {group.id}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxGroupLength }).map((_, idx) => (
                      <tr key={idx}>
                        {groups.map(group => (
                          <td key={group.id} className="border p-2">
                            {group.students?.[idx] ? `${group.students[idx].lastName}, ${group.students[idx].firstName}` : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Schedule Times & Breaks */}
            <div>
              <h2 className="text-lg font-semibold mb-2">Zeiten</h2>
              <div className="mb-4">
                <h3 className="font-medium">Unterrichtszeiten</h3>
                <ul className="list-disc ml-6">
                  {scheduleTimes.map(time => (
                    <li key={time.id}>{time.startTime} - {time.endTime} ({time.hours}h, {time.period})</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-medium">Pausen</h3>
                <ul className="list-disc ml-6">
                  {breakTimes.map(time => (
                    <li key={time.id}>{time.name}: {time.startTime} - {time.endTime} ({time.period})</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Teacher Assignments */}
      <Card>
        <CardHeader>
          <CardTitle>Lehrerzuweisungen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* AM Assignments */}
            <div>
              <h2 className="text-md font-semibold mb-2">Vormittag</h2>
              <table className="min-w-full border text-sm">
                <thead>
                  <tr>
                    <th className="border p-2">Gruppe</th>
                    <th className="border p-2">Lehrer</th>
                    <th className="border p-2">Fach</th>
                    <th className="border p-2">Inhalt</th>
                    <th className="border p-2">Raum</th>
                  </tr>
                </thead>
                <tbody>
                  {amAssignments.map(a => (
                    <tr key={a.groupId}>
                      <td className="border p-2">{a.groupId}</td>
                      <td className="border p-2">{teachers.find(t => t.id === a.teacherId) ? `${teachers.find(t => t.id === a.teacherId)?.lastName}, ${teachers.find(t => t.id === a.teacherId)?.firstName}` : ''}</td>
                      <td className="border p-2">{a.subject}</td>
                      <td className="border p-2">{a.learningContent}</td>
                      <td className="border p-2">{a.room}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* PM Assignments */}
            <div>
              <h2 className="text-md font-semibold mb-2">Nachmittag</h2>
              <table className="min-w-full border text-sm">
                <thead>
                  <tr>
                    <th className="border p-2">Gruppe</th>
                    <th className="border p-2">Lehrer</th>
                    <th className="border p-2">Fach</th>
                    <th className="border p-2">Inhalt</th>
                    <th className="border p-2">Raum</th>
                  </tr>
                </thead>
                <tbody>
                  {pmAssignments.map(a => (
                    <tr key={a.groupId}>
                      <td className="border p-2">{a.groupId}</td>
                      <td className="border p-2">{teachers.find(t => t.id === a.teacherId) ? `${teachers.find(t => t.id === a.teacherId)?.lastName}, ${teachers.find(t => t.id === a.teacherId)?.firstName}` : ''}</td>
                      <td className="border p-2">{a.subject}</td>
                      <td className="border p-2">{a.learningContent}</td>
                      <td className="border p-2">{a.room}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
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
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={handleSaveAndFinish}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save & Finish'}
        </button>
      </div>
    </div>
  );
}
