'use client'

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCachedData } from '@/hooks/use-cached-data';
import { captureFrontendError } from '@/lib/frontend-error'
import { captureError } from '@/lib/sentry'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"


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

type TurnSchedule = Record<string, unknown>

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
 * Displays and manages the class schedule overview, including group and teacher assignments, rotation planning, and PDF export.
 *
 * Fetches and presents group assignments, teacher schedules, and rotation turns for a selected class. Allows saving of teacher rotations and provides an option to generate and download a PDF version of the schedule after saving. Handles loading, error states, and user navigation.
 *
 * @returns The rendered overview page UI for managing and exporting the class schedule.
 */
export default function OverviewPage() {
  const searchParams = useSearchParams();
  const classId = searchParams.get('class');
  const { teachers, isLoading: isLoadingCachedData } = useCachedData();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [amAssignments, setAmAssignments] = useState<TeacherAssignmentResponse[]>([]);
  const [pmAssignments, setPmAssignments] = useState<TeacherAssignmentResponse[]>([]);
  const [scheduleTimes, setScheduleTimes] = useState<ScheduleTime[]>([]);
  const [, setBreakTimes] = useState<BreakTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnSchedule>({});
  const [saving, setSaving] = useState(false);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Debug logs
  console.log('teachers', teachers);
  console.log('amAssignments', amAssignments);
  console.log('pmAssignments', pmAssignments);

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
    } catch (err) {
      console.error('Error fetching overview data:', err);
      captureFrontendError(err, {
        location: 'schedule/create/overview',
        type: 'fetch-data',
        extra: {
          classId
        }
      });
      const errMsg = err instanceof Error ? err.message : 'Failed to load overview data';
      setError(errMsg);
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
          return teacher ? teacher.teacherId : null;
        })
      }));
      const pmRotation = groups.map((group, groupIdx) => ({
        groupId: group.id,
        turns: turnKeys.map((_, turnIdx) => {
          const teacherList = uniquePmTeachers;
          const rotated = rotateArray(teacherList, turnIdx);
          const teacher = rotated[groupIdx];
          return teacher ? teacher.teacherId : null;
        })
      }));

      // Save to backend
      const response = await fetch('/api/schedule/teacher-rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          turns: turnKeys,
          amRotation,
          pmRotation
        })
      });

      if (!response.ok) {
        const error = new Error('Failed to save teacher rotation');
        captureError(error, {
          location: 'schedule/create/overview',
          type: 'save-overview'
        })
        throw new Error('Failed to save teacher rotation');
      }

      // Show PDF generation dialog
      setShowPdfDialog(true);
    } catch (err) {
      console.error('Error saving teacher rotation:', err);
      captureFrontendError(err, {
        location: 'schedule/create/overview',
        type: 'save-rotation',
        extra: {
          classId,
          turns: Object.keys(turns)
        }
      });
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePdf() {
    setGeneratingPdf(true);
    try {
      const export_response = await fetch(`/api/export?classId=${classId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!export_response.ok) {
        const error = new Error('Failed to export schedule');
        captureError(error, {
          location: 'schedule/create/overview',
          type: 'export-schedule'
        })
        throw new Error('Failed to export schedule');
      }

      // Handle PDF download
      const blob = await export_response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schedule-${classId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      router.push('/');
    } catch (err) {
      console.error('Error generating PDF:', err);
      captureFrontendError(err, {
        location: 'schedule/create/overview',
        type: 'generate-pdf'
      });
      setError('Failed to generate PDF.');
    } finally {
      setGeneratingPdf(false);
      setShowPdfDialog(false);
    }
  }

  function handleSkipPdf() {
    setShowPdfDialog(false);
    router.push('/');
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

  // Get unique teachers for AM and PM directly from assignments
  const uniqueAmTeachers = amAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);

  const uniquePmTeachers = pmAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);

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

  return (
    <div className="container mx-auto p-4">
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

      {/* Custom blurred overlay for modal */}
      {showPdfDialog && (
        <div className="fixed inset-0 z-40 backdrop-blur-sm bg-background/80 transition-all" />
      )}
      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent className="z-50">
          <DialogHeader>
            <DialogTitle>Generate PDF Schedule?</DialogTitle>
            <DialogDescription>
              Would you like to generate and download a PDF version of the schedule?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={handleSkipPdf}
              disabled={generatingPdf}
            >
              Skip
            </Button>
            <Button
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
            >
              {generatingPdf ? 'Generating...' : 'Generate PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-end mt-8">
        <button
          className="bg-primary text-primary-foreground px-6 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
          onClick={handleSaveAndFinish}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save & Finish'}
        </button>
      </div>
    </div>
  );
}
