import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Group, TeacherAssignmentResponse, ScheduleTime, BreakTime, TurnSchedule } from '@/types/types'

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
 * Displays a comprehensive overview of a school schedule, including group assignments, class leadership, period times, teacher schedules, turnus data, and additional information.
 *
 * Renders tables for group membership, class head and lead, schedule times with breaks, AM and PM teacher assignments per turn, turnus date sources, and any provided extra notes. Group and schedule data are color-coded and organized for clarity.
 *
 * @param groups - List of groups with their students.
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
 * @returns The rendered schedule overview interface.
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
  weekday
}: ScheduleOverviewProps) {
  // Find the max number of students in any group for row rendering
  const maxStudents = Math.max(...groups.map(g => g.students.length), 0);

  // Get unique teachers for AM and PM
  const uniqueAmTeachers = amAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);

  const uniquePmTeachers = pmAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);

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
          <CardTitle>Datenquellen</CardTitle>
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