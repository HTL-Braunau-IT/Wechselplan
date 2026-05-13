import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Group, TeacherAssignmentResponse, ScheduleTime, BreakTime, TurnSchedule } from '@/types/types'
import type { ScheduleWeek } from '@/types/schedule'
import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { generateExcel, generatePdf, generateSchedulePDF } from '@/lib/export-utils'
import { ScheduleExportActions } from '@/components/schedule/schedule-export-actions'
import { parseScheduleWeekDate } from '@/lib/schedule-data-helpers'
import { pmNachmittagJa, turnScheduleHasPmRhythm } from '@/lib/pm-biweekly-track'

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
  'group-bg-1', // Gruppe 1
  'group-bg-2', // Gruppe 2
  'group-bg-3', // Gruppe 3
  'group-bg-4', // Gruppe 4
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

function formatDate(dateValue?: string) {
  if (!dateValue) return '';
  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('de-DE');
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
  const start = formatDate(entry.weeks[0]?.date);
  const end = formatDate(entry.weeks[entry.weeks.length - 1]?.date);
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

function flattenTurnScheduleWeeks(turns: TurnSchedule): Array<{ turnusKey: string; turnIndex1: number; week: ScheduleWeek }> {
  const sortedKeys = Object.keys(turns).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const out: Array<{ turnusKey: string; turnIndex1: number; week: ScheduleWeek }> = []
  sortedKeys.forEach((k, idx) => {
    const term = turns[k]
    if (!term?.weeks) return
    for (const week of term.weeks) {
      out.push({ turnusKey: k, turnIndex1: idx + 1, week })
    }
  })
  out.sort((a, b) => {
    const da = parseScheduleWeekDate(a.week.date).getTime()
    const db = parseScheduleWeekDate(b.week.date).getTime()
    if (da !== db) return da - db
    return sortedKeys.indexOf(a.turnusKey) - sortedKeys.indexOf(b.turnusKey)
  })
  return out
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

  const pmWeekColumns = useMemo(() => flattenTurnScheduleWeeks(turns), [turns])
  const pmRhythmOn = useMemo(() => turnScheduleHasPmRhythm(turns), [turns])

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
        <div className="mb-8">
          <ScheduleExportActions
            onPdfExport={handlePDFExport}
            onPdfDateExport={handlePDFDatumExport}
            onExcelAmExport={handleExcelAMExport}
            onExcelPmExport={handleExcelPMExport}
            savingPdf={savingPdf}
            savingPdfDate={savingPdfDatum}
            savingExcelAm={savingExcelAM}
            savingExcelPm={savingExcelPM}
            showExcelAm={isTeacherForAM}
            showExcelPm={isTeacherForPM}
          />
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
                      className={`border p-2 text-center font-bold text-foreground ${GROUP_COLORS[idx % GROUP_COLORS.length]}`}
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
              <p className="text-sm text-muted-foreground">Klassenvorstand</p>
              <p className="font-semibold text-lg">{classHead}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Klassenleitung</p>
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
                <p className="text-sm text-muted-foreground">{scheduleTimes.find((time: ScheduleTime) => time.period === 'AM')?.startTime} - {scheduleTimes.find((time: ScheduleTime) => time.period === 'AM')?.endTime}</p>
              </div>
              {breakTimes.filter((time: BreakTime) => time.period === 'AM').length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Pausen:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
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
                <p className="text-sm text-muted-foreground">{scheduleTimes.find((time: ScheduleTime) => time.period === 'PM')?.startTime} - {scheduleTimes.find((time: ScheduleTime) => time.period === 'PM')?.endTime}</p>
              </div>
              {breakTimes.filter((time: BreakTime) => time.period === 'PM').length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Pausen:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
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
                <p className="text-xs font-medium text-muted-foreground mb-1">Mittagspause:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
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

      {/* AM Schedule Table */}
      {uniqueAmTeachers.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{getWeekday(weekday)} (Vormittag)</CardTitle>
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
                        <div className="text-xs text-muted-foreground">{getTurnusInfo(turn, turns).start} - {getTurnusInfo(turn, turns).end}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uniqueAmTeachers.map((assignment, teacherIdx) => (
                    <tr key={assignment.teacherId}>
                      <td className="border p-2 font-medium">{assignment.teacherLastName}, {assignment.teacherFirstName}</td>
                      <td className="border p-2">{assignment.subject ?? ''}</td>
                      <td className="border p-2">{assignment.learningContent ?? ''}</td>
                      <td className="border p-2">{assignment.room ?? ''}</td>
                      {Object.keys(turns).map((turn, turnIdx) => {
                        const group = getGroupForTeacherAndTurn(groups, teacherIdx, turnIdx, 'AM', uniqueAmTeachers);
                        return (
                          <td
                            key={turn}
                            className={`border p-2 text-center font-bold text-foreground ${group ? GROUP_COLORS[groups.findIndex(g => g.id === group.id) % GROUP_COLORS.length] : ''}`}
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
      )}

      {/* PM Schedule Table + week-by-week grid */}
      {uniquePmTeachers.length > 0 && (
        <>
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>{getWeekday(weekday)} (Nachmittag)</CardTitle>
            </CardHeader>
            <CardContent>
              {pmRhythmOn && uniquePmTeachers.some(a => a.pmTrack === 'A' || a.pmTrack === 'B') && (
                <p className="text-xs text-muted-foreground mb-3">
                  NM-Rhythmus: Bei „Nur Spur A/B“ gilt „Nachmittag: Ja“ nur in den passenden Wochen (siehe Tabelle unten).
                </p>
              )}
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
                          <div className="text-xs text-muted-foreground">{getTurnusInfo(turn, turns).start} - {getTurnusInfo(turn, turns).end}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uniquePmTeachers.map((assignment, teacherIdx) => (
                      <tr key={assignment.teacherId}>
                        <td className="border p-2 font-medium">{assignment.teacherLastName}, {assignment.teacherFirstName}</td>
                        <td className="border p-2">{assignment.subject ?? ''}</td>
                        <td className="border p-2">{assignment.learningContent ?? ''}</td>
                        <td className="border p-2">{assignment.room ?? ''}</td>
                        {Object.keys(turns).map((turn, turnIdx) => {
                          const group = getGroupForTeacherAndTurn(groups, teacherIdx, turnIdx, 'PM', uniquePmTeachers);
                          return (
                            <td
                              key={turn}
                              className={`border p-2 text-center font-bold text-foreground ${group ? GROUP_COLORS[groups.findIndex(g => g.id === group.id) % GROUP_COLORS.length] : ''}`}
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

          {pmWeekColumns.length > 0 && pmRhythmOn && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Nachmittag: Woche für Woche</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-2">
                  Ja = Nachmittagsunterricht in dieser Woche, Nein = kein NM (Gruppe bleibt unverändert).
                </p>
                <div className="overflow-x-auto max-w-[100vw]">
                  <table className="min-w-max border text-sm">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-background border p-2 text-left min-w-[10rem]">Lehrer/in</th>
                        {pmWeekColumns.map((col, ci) => (
                          <th key={`${col.turnusKey}-${col.week.date}-${ci}`} className="border p-1 text-center align-bottom min-w-[4.5rem] max-w-[6rem]">
                            <div className="text-[10px] text-muted-foreground">T{col.turnIndex1}</div>
                            <div className="text-xs whitespace-nowrap">{formatDate(col.week.date)}</div>
                            <div className="text-[10px] text-muted-foreground">{col.week.week}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uniquePmTeachers.map((assignment) => (
                        <tr key={`pm-grid-${assignment.teacherId}`}>
                          <td className="sticky left-0 z-10 bg-background border p-2 font-medium whitespace-nowrap">
                            {assignment.teacherLastName}, {assignment.teacherFirstName}
                          </td>
                          {pmWeekColumns.map((col, ci) => {
                            const w = col.week as ScheduleWeek & { pmTrack?: 'A' | 'B' | null }
                            const ja = pmNachmittagJa(assignment.pmTrack, {
                              includedInPlan: w.includedInPlan !== false,
                              pmTrack: w.pmTrack ?? null
                            })
                            return (
                              <td
                                key={ci}
                                className={`border p-1 text-center text-xs font-medium ${
                                  ja ? 'text-foreground bg-emerald-500/10' : 'text-muted-foreground bg-muted/40'
                                }`}
                              >
                                {ja ? 'Nachmittag: Ja' : 'Nachmittag: Nein'}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

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
                  <th className="border p-2">Im Plan</th>
                  {pmRhythmOn && <th className="border p-2">NM</th>}
                </tr>
              </thead>
              <tbody>
                {Object.entries(turns).map(([turnusKey, turnus], index) => (
                  (turnus as { weeks: ScheduleWeek[] }).weeks.map((week, weekIndex) => {
                    const excluded = week.includedInPlan === false
                    const spur = (week as ScheduleWeek & { pmTrack?: 'A' | 'B' | null }).pmTrack
                    return (
                    <tr key={`${turnusKey}-${weekIndex}`} className={excluded ? 'opacity-60' : undefined}>
                      {weekIndex === 0 && (
                        <td className="border p-2" rowSpan={(turnus as { weeks: { date: string }[] }).weeks.length}>
                          Turnus {index + 1}
                        </td>
                      )}
                      <td className="border p-2">{formatDate(week.date)}</td>
                      <td className="border p-2">{week.week}</td>
                      <td className="border p-2 text-center">{excluded ? 'nein' : 'ja'}</td>
                      {pmRhythmOn && (
                        <td className="border p-2 text-center">{spur ?? '—'}</td>
                      )}
                    </tr>
                    )
                  })
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