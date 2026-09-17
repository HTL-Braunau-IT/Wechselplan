import { parse, isValid, isWithinInterval, addWeeks } from 'date-fns'
import type {
  TeacherScheduleData,
  NormalizedTurn,
  Assignment,
  ScheduleTime,
  BreakTime,
  Student,
} from '@/types/types'

/**
 * Resolves a single weekday's raw schedule payload (`/api/schedules/data`) into
 * the handful of facts the dashboard actually renders per teaching slot.
 *
 * The rotation maths — which group a teacher has *this* turnus, which colleagues
 * run the parallel groups — is the load-bearing logic that used to live inline in
 * the teacher overview. It is ported here verbatim so the dashboard resolves the
 * same group the Notenliste does, keeping attendance keyed on the right group.
 */

export type OtherGroup = {
  groupId: number
  teacher: string
  room: string | null
}

export type ResolvedSlot = {
  period: 'AM' | 'PM'
  classId: number
  className: string
  classHead: string
  classLead: string
  /** The rotating group the teacher has this turnus, as a 1-based group number. */
  groupId: number | null
  roomName: string | null
  scheduleTime: ScheduleTime | null
  breakTimes: BreakTime[]
  additionalInfo: string
  otherGroups: OtherGroup[]
  turnName: string | null
  remainingWeeks: number
  students: Student[]
}

type CurrentWeekResult = { turnIndex: number; turn: NormalizedTurn } | null

function getTurnsForClass(
  data: TeacherScheduleData,
  classId: number,
): NormalizedTurn[] | undefined {
  const classSchedule = data.schedules.find(schedules =>
    schedules.some(s => Number(s.classId) === classId),
  )
  return classSchedule?.[0]?.turns
}

function getCurrentWeek(turns: NormalizedTurn[] | undefined, now: Date): CurrentWeekResult {
  if (!turns || turns.length === 0) return null
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]
    if (!turn) continue
    const inThisTurn = turn.weeks.some(week => {
      const parsed = parse(week.date, 'dd.MM.yy', new Date())
      if (!isValid(parsed)) return false
      const weekEnd = addWeeks(parsed, 1)
      return isWithinInterval(now, { start: parsed, end: weekEnd })
    })
    if (inThisTurn) return { turnIndex: i, turn }
  }
  return null
}

function getRemainingWeeks(turns: NormalizedTurn[] | undefined, now: Date): number {
  const currentWeek = getCurrentWeek(turns, now)
  if (!currentWeek) return 0
  return currentWeek.turn.weeks.filter(week => {
    const parsed = parse(week.date, 'dd.MM.yy', new Date())
    return isValid(parsed) && parsed > now
  }).length
}

function rotateArray<T>(arr: T[], n: number): T[] {
  const rotated = [...arr]
  for (let i = 0; i < n; i++) {
    const temp = rotated.shift()
    if (temp !== undefined) rotated.push(temp)
  }
  return rotated
}

function getActualGroupForAssignment(
  data: TeacherScheduleData,
  classAssignments: Assignment[],
  assignment: Assignment,
  now: Date,
): number | null {
  const turns = getTurnsForClass(data, assignment.classId)
  if (!turns) return assignment.groupId ?? null

  const currentWeek = getCurrentWeek(turns, now)
  if (currentWeek && data.teacherRotation?.length) {
    const turnName = currentWeek.turn.name
    const rotation = data.teacherRotation.find(
      r =>
        Number(r.teacherId) === Number(assignment.teacherId) &&
        r.classId === assignment.classId &&
        r.period === assignment.period &&
        r.turnId === turnName,
    )
    if (rotation) return rotation.groupId
  }

  const classStudents = data.students.find(students =>
    students.some(student => student.classId === assignment.classId),
  )
  if (!classStudents) return assignment.groupId ?? null

  const groupIds = [
    ...new Set(
      classStudents
        .filter(s => s.classId === assignment.classId && s.groupId)
        .map(s => s.groupId as number),
    ),
  ].sort((a, b) => a - b)
  if (groupIds.length === 0) return assignment.groupId ?? null

  const periodAssignments = classAssignments.filter(
    a => a.classId === assignment.classId && a.period === assignment.period,
  )
  const uniqueTeachers = periodAssignments
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx)
    .sort((a, b) => a.teacherId - b.teacherId)

  const teacherIndex = uniqueTeachers.findIndex(t => t.teacherId === assignment.teacherId)
  if (teacherIndex === -1) return assignment.groupId ?? null

  const turnIndex = currentWeek?.turnIndex ?? 0
  const rotatedGroups = rotateArray(groupIds, turnIndex)
  return rotatedGroups[teacherIndex] ?? assignment.groupId ?? null
}

function getScheduleTime(
  data: TeacherScheduleData,
  classId: number,
  period: string,
): ScheduleTime | null {
  const classSchedule = data.schedules.find(schedules =>
    schedules.some(s => Number(s.classId) === classId),
  )
  return (
    classSchedule?.[0]?.scheduleTimes?.find((time: ScheduleTime) => time.period === period) ?? null
  )
}

function getBreakTimes(data: TeacherScheduleData, classId: number, period: string): BreakTime[] {
  const classSchedule = data.schedules.find(schedules =>
    schedules.some(s => Number(s.classId) === classId),
  )
  const schedule = classSchedule?.[0]
  if (!schedule?.breakTimes) return []
  return schedule.breakTimes.filter(
    (time: BreakTime) => time.period === period || time.period === 'LUNCH',
  )
}

function getStudentsForGroup(
  data: TeacherScheduleData,
  groupId: number | null,
  classId: number,
): Student[] {
  if (groupId == null) return []
  const classStudents = data.students.find(students =>
    students.some(student => student.classId === classId),
  )
  return (
    classStudents?.filter(student => student.groupId === groupId && student.classId === classId) ??
    []
  )
}

/**
 * All of the teacher's own slots for the fetched weekday, resolved and sorted
 * AM before PM. Days the teacher does not teach resolve to an empty array.
 */
export function resolveDay(data: TeacherScheduleData | null, now: Date): ResolvedSlot[] {
  if (!data?.schedules || !data.assignments) return []
  const classAssignments = data.classAssignments ?? data.assignments

  return data.assignments
    .map(assignment => {
      const classInfo = data.classdata?.find(c => c.id === assignment.classId)
      const period = assignment.period === 'PM' ? 'PM' : 'AM'
      const turns = getTurnsForClass(data, assignment.classId)
      const currentWeek = getCurrentWeek(turns, now)
      const groupId = getActualGroupForAssignment(data, classAssignments, assignment, now)

      const otherGroups: OtherGroup[] = classAssignments
        .filter(c => c.classId === assignment.classId && c.period === assignment.period)
        .map(c => ({
          candidate: c,
          actualGroupId: getActualGroupForAssignment(data, classAssignments, c, now),
        }))
        .filter(({ actualGroupId }) => actualGroupId != null && actualGroupId !== groupId)
        .map(({ candidate, actualGroupId }) => ({
          groupId: actualGroupId!,
          teacher:
            [candidate.teacherFirstName, candidate.teacherLastName]
              .filter(Boolean)
              .join(' ')
              .trim() || '—',
          room: candidate.roomName ?? null,
        }))
        .sort((a, b) => a.groupId - b.groupId)

      const additionalInfoRaw = data.schedules
        .find(list => list.some(s => Number(s.classId) === assignment.classId))
        ?.at(0)?.additionalInfo
      const additionalInfo = additionalInfoRaw?.trim() ?? ''

      return {
        period,
        classId: assignment.classId,
        className: classInfo?.name ?? `Klasse ${assignment.classId}`,
        classHead: classInfo?.classHead ?? '—',
        classLead: classInfo?.classLead ?? '—',
        groupId,
        roomName: assignment.roomName ?? null,
        scheduleTime: getScheduleTime(data, assignment.classId, period),
        breakTimes: getBreakTimes(data, assignment.classId, period),
        additionalInfo: additionalInfo === '—' ? '' : additionalInfo,
        otherGroups,
        turnName: currentWeek?.turn.name ?? null,
        remainingWeeks: getRemainingWeeks(turns, now),
        students: getStudentsForGroup(data, groupId, assignment.classId).sort((a, b) =>
          a.lastName.localeCompare(b.lastName, 'de'),
        ),
      } satisfies ResolvedSlot
    })
    .sort((a, b) => (a.period === b.period ? 0 : a.period === 'AM' ? -1 : 1))
}

/**
 * The current turnus range and countdown for a class, for the week strip's
 * summary column. Dates come back in the schedule's `dd.MM.yy` form.
 */
export function turnusSummary(
  data: TeacherScheduleData | null,
  classId: number | undefined,
  now: Date,
): { name: string; range: string; remainingWeeks: number } | null {
  if (!data || classId == null) return null
  const turns = getTurnsForClass(data, classId)
  const currentWeek = getCurrentWeek(turns, now)
  if (!currentWeek) return null
  const weeks = currentWeek.turn.weeks
  const first = weeks[0]?.date ?? ''
  const last = weeks[weeks.length - 1]?.date ?? ''
  const short = (d: string) => d.replace(/\.\d\d$/, '.') // dd.MM.yy → dd.MM.
  return {
    name: currentWeek.turn.name,
    range: first && last ? `${short(first)} – ${short(last)}` : '',
    remainingWeeks: getRemainingWeeks(turns, now),
  }
}

/**
 * Name of the turn whose first teaching week begins on the given Monday
 * (`dd.MM.yy`), or null. Drives the "Turnus beginnt" marker on the week strip.
 */
export function turnStartingOn(
  data: TeacherScheduleData | null,
  classId: number | undefined,
  ddmmyy: string,
): string | null {
  if (!data || classId == null) return null
  const turns = getTurnsForClass(data, classId)
  if (!turns) return null
  for (const turn of turns) {
    const firstTeachingWeek = turn.weeks.find(w => !w.isHoliday) ?? turn.weeks[0]
    if (firstTeachingWeek?.date === ddmmyy) return turn.name
  }
  return null
}
