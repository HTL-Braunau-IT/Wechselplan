import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CalendarRange, Clock, GraduationCap, Info, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  Group,
  TeacherAssignmentResponse,
  ScheduleTime,
  BreakTime,
  TurnSchedule,
} from '@/types/types'
import { cn } from '@/lib/utils'
import { rotatedGroupIndex } from '@/lib/rotation'

interface ScheduleOverviewProps {
  groups: Group[]
  amAssignments: TeacherAssignmentResponse[]
  pmAssignments: TeacherAssignmentResponse[]
  scheduleTimes: ScheduleTime[]
  breakTimes: BreakTime[]
  /** Merged Turnusse — the fallback when the per-lane sets are not supplied. */
  turns: TurnSchedule
  /**
   * Per-lane Turnusse. AM and PM can differ in count/cadence, so when these are
   * provided each rotation table and the calendar use their own lane; callers
   * that omit them (e.g. the read-only /schedules viewer) fall back to `turns`.
   */
  amTurns?: TurnSchedule
  pmTurns?: TurnSchedule
  classHead: string
  classLead: string
  additionalInfo: string
  weekday: number
}

/** Soft, theme-aware tint per group, used on both the group columns and the rotation cells. */
const GROUP_COLORS = [
  'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100',
  'bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100',
  'bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-100',
  'bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-100',
]

const groupColor = (idx: number) => GROUP_COLORS[idx % GROUP_COLORS.length]

/**
 * Determines the group assigned to a teacher for a given turn, using the shared
 * round-robin formula so this preview always matches the persisted rotation.
 */
function getGroupForTeacherAndTurn(
  groups: Group[],
  teacherIdx: number,
  turnIdx: number,
  uniqueTeachers: TeacherAssignmentResponse[],
) {
  if (!groups[0] || !uniqueTeachers[teacherIdx]) return null
  return groups[rotatedGroupIndex(teacherIdx, turnIdx, groups.length)]
}

/** Start and end date of a turnus, read from its weeks. */
function getTurnusInfo(turnKey: string, turns: TurnSchedule) {
  const entry = turns[turnKey] as { weeks?: { date: string }[] }
  if (!entry?.weeks?.length) return { start: '', end: '' }
  const start = entry.weeks[0]?.date ?? ''
  const end = entry.weeks[entry.weeks.length - 1]?.date ?? ''
  return { start, end }
}

function getWeekday(weekday: number) {
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  return weekday === undefined ? '' : days[weekday]
}

/** A card with an icon-led title, matching the app's section styling. */
function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="text-muted-foreground h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** Shared header-cell styling for the overview's tables. */
const thClass =
  'border-b px-3 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground'
const tdClass = 'border-b px-3 py-2 align-middle'

/**
 * Read-only overview of a class's rotation plan: group membership, class
 * leadership, period times, the teacher rotation per turnus, the turnus
 * calendar, and any notes. Purely presentational — the exports and the
 * teacher-assignment lookup that used to live here now belong to the page.
 */
export function ScheduleOverview({
  groups,
  amAssignments,
  pmAssignments,
  scheduleTimes,
  breakTimes,
  turns,
  amTurns,
  pmTurns,
  classHead,
  classLead,
  additionalInfo,
  weekday,
}: ScheduleOverviewProps) {
  const maxStudents = Math.max(...groups.map(g => g.students.length), 0)

  // Each lane draws from its own Turnusse when provided, else the merged set.
  const turnsFor = (period: 'AM' | 'PM'): TurnSchedule =>
    (period === 'AM' ? amTurns : pmTurns) ?? turns

  // Calendar: one table per lane when the lanes genuinely differ, otherwise a
  // single combined table (identical lanes, or no per-lane data at all).
  const lanesProvided = amTurns !== undefined || pmTurns !== undefined
  const calendars: { label: string; turns: TurnSchedule }[] = !lanesProvided
    ? [{ label: '', turns }]
    : JSON.stringify(amTurns ?? {}) === JSON.stringify(pmTurns ?? {})
      ? [{ label: '', turns: amTurns ?? {} }]
      : [
          { label: 'Vormittag', turns: amTurns ?? {} },
          { label: 'Nachmittag', turns: pmTurns ?? {} },
        ].filter(c => Object.keys(c.turns).length > 0)

  const uniqueTeachers = (assignments: TeacherAssignmentResponse[]) =>
    assignments
      .filter(a => a.teacherId !== 0)
      .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx)

  const uniqueAmTeachers = uniqueTeachers(amAssignments)
  const uniquePmTeachers = uniqueTeachers(pmAssignments)

  const amTime = scheduleTimes.find(time => time.period === 'AM')
  const pmTime = scheduleTimes.find(time => time.period === 'PM')
  const breaksFor = (period: BreakTime['period']) =>
    breakTimes.filter(time => time.period === period)

  return (
    <div className="space-y-6">
      {/* Groups */}
      <SectionCard icon={Users} title="Gruppenübersicht">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(thClass, 'bg-muted/50 w-10 text-center')}>Nr.</th>
                {groups.map((group, idx) => (
                  <th
                    key={group.id}
                    className={cn(
                      'border-b px-3 py-2 text-center text-sm font-semibold',
                      groupColor(idx),
                    )}
                  >
                    Gruppe {group.id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxStudents }).map((_, rowIdx) => (
                <tr key={rowIdx} className="even:bg-muted/20">
                  <td className={cn(tdClass, 'text-muted-foreground text-center tabular-nums')}>
                    {rowIdx + 1}
                  </td>
                  {groups.map(group => {
                    const student = group.students[rowIdx]
                    return (
                      <td key={group.id} className={cn(tdClass, 'text-center')}>
                        {student ? `${student.lastName} ${student.firstName}` : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Leadership + times */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard icon={GraduationCap} title="Klassenleitung">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Klassenvorstand
              </p>
              <p className="mt-1 text-base font-semibold">{classHead}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Klassenleitung
              </p>
              <p className="mt-1 text-base font-semibold">{classLead}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={Clock} title="Zeiten">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {[
              { label: 'Vormittag', time: amTime, breaks: breaksFor('AM') },
              { label: 'Nachmittag', time: pmTime, breaks: breaksFor('PM') },
            ].map(({ label, time, breaks }) => (
              <div key={label} className="space-y-2">
                <div className="border-b pb-2">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {time ? `${time.startTime} – ${time.endTime}` : '—'}
                  </p>
                </div>
                {breaks.length > 0 && (
                  <ul className="text-muted-foreground space-y-1 text-xs">
                    {breaks.map(b => (
                      <li key={b.id} className="tabular-nums">
                        {b.name}: {b.startTime} – {b.endTime}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {breaksFor('LUNCH').length > 0 && (
              <div className="border-t pt-3 sm:col-span-2">
                <p className="text-muted-foreground mb-1 text-xs font-medium">Mittagspause</p>
                <ul className="text-muted-foreground space-y-1 text-xs">
                  {breaksFor('LUNCH').map(b => (
                    <li key={b.id} className="tabular-nums">
                      {b.name}: {b.startTime} – {b.endTime}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Rotation tables — each lane over its own Turnusse */}
      {[
        { period: 'AM' as const, label: 'Vormittag', teachers: uniqueAmTeachers },
        { period: 'PM' as const, label: 'Nachmittag', teachers: uniquePmTeachers },
      ]
        .filter(({ teachers }) => teachers.length > 0)
        .map(({ period, label, teachers }) => {
          const periodTurns = turnsFor(period)
          const turnKeys = Object.keys(periodTurns)
          return (
            <SectionCard
              key={period}
              icon={CalendarRange}
              title={`${getWeekday(weekday)} · ${label}`}
            >
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className={thClass}>Lehrer/in</th>
                      <th className={thClass}>Werkstätte</th>
                      <th className={thClass}>Lehrinhalt</th>
                      <th className={thClass}>Raum</th>
                      {turnKeys.map((turn, turnIdx) => {
                        const { start, end } = getTurnusInfo(turn, periodTurns)
                        return (
                          <th key={turn} className={cn(thClass, 'text-center')}>
                            <div className="text-foreground font-semibold">
                              Turnus {turnIdx + 1}
                            </div>
                            {start && (
                              <div className="text-muted-foreground text-[11px] font-normal tabular-nums">
                                {start} – {end}
                              </div>
                            )}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((assignment, teacherIdx) => (
                      <tr key={assignment.teacherId} className="even:bg-muted/20">
                        <td className={cn(tdClass, 'font-medium whitespace-nowrap')}>
                          {assignment.teacherLastName}, {assignment.teacherFirstName}
                        </td>
                        <td className={tdClass}>{assignment.subject ?? ''}</td>
                        <td className={tdClass}>{assignment.learningContent ?? ''}</td>
                        <td className={tdClass}>{assignment.room ?? ''}</td>
                        {turnKeys.map((turn, turnIdx) => {
                          const group = getGroupForTeacherAndTurn(
                            groups,
                            teacherIdx,
                            turnIdx,
                            teachers,
                          )
                          const colorIdx = group ? groups.findIndex(g => g.id === group.id) : -1
                          return (
                            <td key={turn} className={cn(tdClass, 'p-1.5 text-center')}>
                              {group && (
                                <span
                                  className={cn(
                                    'inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-semibold',
                                    groupColor(colorIdx),
                                  )}
                                >
                                  {group.id}
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )
        })}

      {/* Turnus calendar — one table per lane when the lanes differ */}
      {calendars.map(calendar => (
        <SectionCard
          key={calendar.label || 'all'}
          icon={CalendarRange}
          title={calendar.label ? `Turnusse · ${calendar.label}` : 'Turnusse'}
        >
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className={thClass}>Turnus</th>
                  <th className={thClass}>Datum</th>
                  <th className={thClass}>Woche</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(calendar.turns).map(([turnusKey, turnus], index) =>
                  (turnus as { weeks: { date: string; week: string }[] }).weeks.map(
                    (week, weekIndex) => (
                      <tr key={`${turnusKey}-${weekIndex}`} className="even:bg-muted/20">
                        {weekIndex === 0 && (
                          <td
                            className={cn(tdClass, 'align-top font-medium')}
                            rowSpan={(turnus as { weeks: unknown[] }).weeks.length}
                          >
                            Turnus {index + 1}
                          </td>
                        )}
                        <td className={cn(tdClass, 'tabular-nums')}>{week.date}</td>
                        <td className={cn(tdClass, 'text-muted-foreground')}>{week.week}</td>
                      </tr>
                    ),
                  ),
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ))}

      {additionalInfo && (
        <SectionCard icon={Info} title="Zusätzliche Informationen">
          <p className="text-sm whitespace-pre-line">{additionalInfo}</p>
        </SectionCard>
      )}
    </div>
  )
}
