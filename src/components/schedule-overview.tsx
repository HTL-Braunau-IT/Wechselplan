import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Group, TeacherAssignmentResponse, ScheduleTime, BreakTime, TurnSchedule } from '@/types/types'
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Spinner } from '@/components/ui/spinner'
import { generateExcel, generatePdf, generateSchedulePDF } from '@/lib/export-utils'

interface ScheduleOverviewProps {
  groups: Group[]
  amAssignments: TeacherAssignmentResponse[]
  pmAssignments: TeacherAssignmentResponse[]
  scheduleTimes: ScheduleTime[]
  breakTimes: BreakTime[]
  turns: TurnSchedule
  classHead: string
  classLead: string
  additionalInfo: string
  weekday: number
  className?: string
  showExportButtons?: boolean
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
 * Returns a new array with elements shifted left by a given number of positions, wrapping items from the front to the end.
 *
 * @param arr - The array to rotate.
 * @param n - The number of positions to rotate the array to the left.
 * @returns A new array with elements rotated left by {@link n} positions.
 */
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

/**
 * Determines the group assigned to a teacher for a given turn and period by rotating the group list.
 *
 * @param groups - List of groups to assign.
 * @param teacherIdx - Index of the teacher in the unique teachers list.
 * @param turnIdx - Index of the current turn.
 * @param period - The period ('AM' or 'PM') for which the assignment is made.
 * @param uniqueTeachers - List of unique teacher assignments.
 * @returns The assigned group for the teacher and turn, or null if inputs are invalid.
 */
function getGroupForTeacherAndTurn(
  groups: Group[],
  teacherIdx: number,
  turnIdx: number,
  period: 'AM' | 'PM',
  uniqueTeachers: TeacherAssignmentResponse[]
) {
  if (!groups[0] || !uniqueTeachers[teacherIdx]) return null;
  const rotatedGroups = rotateArray(groups, turnIdx);
  const group = rotatedGroups[teacherIdx];
  return group;
}

/**
 * Retrieves the start date, end date, and number of days for a given turn from the turn schedule.
 *
 * @param turnKey - The key identifying the turn in the schedule.
 * @param turns - The turn schedule object containing week data.
 * @returns An object with the start date, end date, and total number of days for the specified turn. Returns empty strings and zero if no weeks are found.
 */
function getTurnusInfo(turnKey: string, turns: TurnSchedule) {
  const entry = turns[turnKey] as { weeks?: { date: string }[] };
  if (!entry?.weeks?.length) return { start: '', end: '', days: 0 };
  const start = entry.weeks[0]?.date ?? '';
  const end = entry.weeks[entry.weeks.length - 1]?.date ?? '';
  const days = entry.weeks.length;
  return { start, end, days };
}

/**
 * Returns the German name of the weekday for a given numeric value.
 *
 * @param weekday - Numeric representation of the weekday (0 for Sunday, 1 for Monday, etc.).
 * @returns The German name of the weekday, or an empty string if {@link weekday} is undefined.
 */
function getWeekday(weekday: number) {
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  return weekday === undefined ? '' : days[weekday];
}

/**
 * Renders a detailed overview of a school schedule, including group membership, class leadership, period times with breaks, teacher assignments per turn, turnus data, and optional additional notes.
 *
 * Displays color-coded tables for groups and teacher assignments, a summary of class head and lead, period and break times, a turnus schedule, and any extra information provided. Designed for clarity and comprehensive schedule visualization.
 *
 * @param groups - The list of groups with their students.
 * @param amAssignments - Teacher assignments for the morning period.
 * @param pmAssignments - Teacher assignments for the afternoon period.
 * @param scheduleTimes - Start and end times for AM and PM periods.
 * @param breakTimes - Break and lunch times for each period.
 * @param turns - Turn schedule data with weeks and dates.
 * @param classHead - Name of the class head.
 * @param classLead - Name of the class lead.
 * @param additionalInfo - Optional extra information to display.
 * @param weekday - Numeric representation of the weekday (0=Sunday).
 *
 * @returns The rendered schedule overview interface as a React element.
 */
export function ScheduleOverview({
  groups,
  amAssignments,
  pmAssignments,
  scheduleTimes,
  breakTimes,
  turns,
  classHead,
  classLead,
  additionalInfo,
  weekday,
  className,
  showExportButtons = false
}: ScheduleOverviewProps) {
  const { data: session } = useSession()
  const [isTeacherForAM, setIsTeacherForAM] = useState(false)
  const [isTeacherForPM, setIsTeacherForPM] = useState(false)
  const [savingPdf, setSavingPdf] = useState(false)
  const [savingPdfDatum, setSavingPdfDatum] = useState(false)
  const [savingExcelAM, setSavingExcelAM] = useState(false)
  const [savingExcelPM, setSavingExcelPM] = useState(false)

  // Find the max number of students in any group for row rendering
  const maxStudents = Math.max(...groups.map(g => g.students.length), 0);

  // Get unique teachers for AM and PM
  const uniqueAmTeachers = amAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);

  const uniquePmTeachers = pmAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);

  // Check if user is a teacher for the class
  useEffect(() => {
    async function checkTeacherAssignment() {
      if (!session?.user?.name || !className || !showExportButtons) {
        setIsTeacherForAM(false)
        setIsTeacherForPM(false)
        return
      }

      try {
        // First, get the teacher record for the current user
        const teacherResponse = await fetch(`/api/teachers/by-username?username=${session.user.name}`)
        if (!teacherResponse.ok) {
          console.log('Failed to fetch teacher record:', teacherResponse.status)
          setIsTeacherForAM(false)
          setIsTeacherForPM(false)
          return
        }

        const teacher = await teacherResponse.json()
        if (!teacher) {
          setIsTeacherForAM(false)
          setIsTeacherForPM(false)
          return
        }

        // Check if user is assigned as a teacher in AM assignments
        const isAssignedAM = amAssignments.some(a => a.teacherId === teacher.id)
        // Check if user is assigned as a teacher in PM assignments
        const isAssignedPM = pmAssignments.some(a => a.teacherId === teacher.id)
        
        setIsTeacherForAM(isAssignedAM)
        setIsTeacherForPM(isAssignedPM)
      } catch {
        setIsTeacherForAM(false)
        setIsTeacherForPM(false)
      }
    }

    void checkTeacherAssignment()
  }, [className, session?.user?.name, amAssignments, pmAssignments, showExportButtons])

  // Export handlers
  const handlePDFExport = async () => {
    if (!className) return
    setSavingPdf(true)
    try {
      await generatePdf(className, weekday)
    } catch (error) {
      console.error('Error generating PDF:', error)
    } finally {
      setSavingPdf(false)
    }
  }

  const handlePDFDatumExport = async () => {
    if (!className) return
    setSavingPdfDatum(true)
    try {
      await generateSchedulePDF(className, weekday)
    } catch (error) {
      console.error('Error generating PDF with date:', error)
    } finally {
      setSavingPdfDatum(false)
    }
  }

  const handleExcelAMExport = async () => {
    if (!className || !session?.user?.name) return
    setSavingExcelAM(true)
    try {
      await generateExcel(className, weekday, session.user.name, 'AM')
    } catch (error) {
      console.error('Error generating AM Excel:', error)
    } finally {
      setSavingExcelAM(false)
    }
  }

  const handleExcelPMExport = async () => {
    if (!className || !session?.user?.name) return
    setSavingExcelPM(true)
    try {
      await generateExcel(className, weekday, session.user.name, 'PM')
    } catch (error) {
      console.error('Error generating PM Excel:', error)
    } finally {
      setSavingExcelPM(false)
    }
  }

  return (
    <div className="container mx-auto p-4">
      {/* Export Buttons */}
      {showExportButtons && className && (
        <div className="flex items-center gap-2 mb-8">
          <button
            className="bg-primary text-primary-foreground px-6 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
            onClick={handlePDFExport}
            disabled={savingPdf}
          >
            {savingPdf ? 'Exporting PDF...' : 'PDF Export'}
          </button>
          <button
            className="bg-primary text-primary-foreground px-6 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
            onClick={handlePDFDatumExport}
            disabled={savingPdfDatum}
          >
            {savingPdfDatum ? 'Exporting PDF Datum ...' : 'PDF Datum Export'}
          </button>

          {/* AM Excel Export Button - only show if teacher is assigned to AM */}
          {isTeacherForAM && (
            <button
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              onClick={handleExcelAMExport}
              disabled={savingExcelAM}
            >
              {savingExcelAM ? (
                <>
                  <Spinner size="sm" />
                  Exporting AM Excel ...
                </>
              ) : (
                'Export Notenliste Vormittag'
              )}
            </button>
          )}

          {/* PM Excel Export Button - only show if teacher is assigned to PM */}
          {isTeacherForPM && (
            <button
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              onClick={handleExcelPMExport}
              disabled={savingExcelPM}
            >
              {savingExcelPM ? (
                <>
                  <Spinner size="sm" />
                  Exporting PM Excel ...
                </>
              ) : (
                'Export Notenliste Nachmittag'
              )}
            </button>
          )}
        </div>
      )}

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
                  <th className="border p-1 text-center font-bold w-8">Nr.</th>
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
                    <td className="border p-1 text-center font-bold w-8">{rowIdx + 1}</td>
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

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Klassenleitung</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Klassenvorstand</p>
              <p className="font-semibold text-lg">{classHead}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Klassenleitung</p>
              <p className="font-semibold text-lg">{classLead}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Zeiten</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="border-b pb-2">
                <p className="text-sm font-medium">Vormittag</p>
                <p className="text-sm text-gray-500">{scheduleTimes.find((time: ScheduleTime) => time.period === 'AM')?.startTime} - {scheduleTimes.find((time: ScheduleTime) => time.period === 'AM')?.endTime}</p>
              </div>
              {breakTimes.filter((time: BreakTime) => time.period === 'AM').length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Pausen:</p>
                  <ul className="text-xs text-gray-400 space-y-1">
                    {breakTimes
                      .filter((time: BreakTime) => time.period === 'AM')
                      .map((time: BreakTime) => (
                        <li key={time.id}>{time.name}: {time.startTime} - {time.endTime}</li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="border-b pb-2">
                <p className="text-sm font-medium">Nachmittag</p>
                <p className="text-sm text-gray-500">{scheduleTimes.find((time: ScheduleTime) => time.period === 'PM')?.startTime} - {scheduleTimes.find((time: ScheduleTime) => time.period === 'PM')?.endTime}</p>
              </div>
              {breakTimes.filter((time: BreakTime) => time.period === 'PM').length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Pausen:</p>
                  <ul className="text-xs text-gray-400 space-y-1">
                    {breakTimes
                      .filter((time: BreakTime) => time.period === 'PM')
                      .map((time: BreakTime) => (
                        <li key={time.id}>{time.name}: {time.startTime} - {time.endTime}</li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
            {breakTimes.filter((time: BreakTime) => time.period === 'LUNCH').length > 0 && (
              <div className="col-span-2 border-t pt-4">
                <p className="text-xs font-medium text-gray-500 mb-1">Mittagspause:</p>
                <ul className="text-xs text-gray-400 space-y-1">
                  {breakTimes
                    .filter((time: BreakTime) => time.period === 'LUNCH')
                    .map((time: BreakTime) => (
                      <li key={time.id}>{time.name}: {time.startTime} - {time.endTime}</li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AM and PM Schedule Tables */}
      {[{ period: 'AM', teachers: uniqueAmTeachers }, { period: 'PM', teachers: uniquePmTeachers }]
        .filter(({ teachers }) => teachers.length > 0)
        .map(({ period, teachers }) => (
        <Card className="mb-8" key={period}>
          <CardHeader>
            <CardTitle>{getWeekday(weekday)} ({period === 'AM' ? 'Vormittag' : 'Nachmittag'})</CardTitle>
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
                        <div className="text-xs text-gray-600">{getTurnusInfo(turn, turns).start} - {getTurnusInfo(turn, turns).end}</div>
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
                        const group = getGroupForTeacherAndTurn(groups, teacherIdx, turnIdx, period as 'AM' | 'PM', teachers);
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

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Turnusse</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead>
                <tr>
                  <th className="border p-2">Turnus</th>
                  <th className="border p-2">Datum</th>
                  <th className="border p-2">Woche</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(turns).map(([turnusKey, turnus], index) => (
                  (turnus as { weeks: { date: string; week: string; isHoliday: boolean }[] }).weeks.map((week, weekIndex) => (
                    <tr key={`${turnusKey}-${weekIndex}`}>
                      {weekIndex === 0 && (
                        <td className="border p-2" rowSpan={(turnus as { weeks: { date: string }[] }).weeks.length}>
                          Turnus {index + 1}
                        </td>
                      )}
                      <td className="border p-2">{week.date}</td>
                      <td className="border p-2">{week.week}</td>
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {additionalInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Zusätzliche Informationen</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{additionalInfo}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 