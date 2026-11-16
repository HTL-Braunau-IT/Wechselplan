import { describe, expect, it } from 'vitest'
import type { TeacherScheduleData } from '@/types/types'
import { resolveDay, slotKey } from '../resolve-slot'

const now = new Date(2026, 9, 5, 9) // Mon 05.10.26, inside TURNUS 1

const assignment = (teacherId: number, groupId: number) => ({
  id: teacherId,
  teacherId,
  classId: 4,
  period: 'AM',
  groupId,
  teacherFirstName: `T${teacherId}`,
  teacherLastName: '',
  roomName: null,
})

/** Class 4, groups 1–2 hold students, group 3 is deliberately empty. */
function data(ownGroup: number): TeacherScheduleData {
  const rotation = [1, 2, 3].map(teacherId => ({
    classId: 4,
    teacherId,
    groupId: teacherId === 1 ? ownGroup : teacherId === ownGroup ? 1 : teacherId,
    turnId: 'TURNUS 1',
    period: 'AM',
  }))
  return {
    schedules: [
      [
        {
          classId: 4,
          turns: [{ name: 'TURNUS 1', period: 'AM', weeks: [{ date: '05.10.26' }] }],
        },
      ],
    ],
    students: [
      [
        { id: 1, firstName: 'A', lastName: 'A', classId: 4, groupId: 1 },
        { id: 2, firstName: 'B', lastName: 'B', classId: 4, groupId: 2 },
      ],
    ],
    teacherRotation: rotation,
    assignments: [assignment(1, 1)],
    classAssignments: [assignment(1, 1), assignment(2, 2), assignment(3, 3)],
    classdata: [{ id: 4, name: '1A', classHead: null, classLead: null }],
  } as unknown as TeacherScheduleData
}

describe('resolveDay with a deliberately empty group', () => {
  it('shows no group when the teacher rotates onto the empty one', () => {
    const [slot] = resolveDay(data(3), now)
    expect(slot?.groupId).toBeNull()
    expect(slot?.students).toEqual([])
    expect(slot?.otherGroups.map(g => g.groupId)).toEqual([1, 2])
  })

  it('leaves the empty group out of the colleagues list', () => {
    const [slot] = resolveDay(data(1), now)
    expect(slot?.groupId).toBe(1)
    expect(slot?.otherGroups.map(g => g.groupId)).toEqual([2])
  })
})

/** One PM class on a lane meeting on the given dates, two Turnusse, two teachers. */
function pmClass(classId: number, name: string, turn1: string[], turn2: string[]) {
  const assignmentFor = (teacherId: number) => ({
    id: classId * 10 + teacherId,
    teacherId,
    classId,
    period: 'PM',
    groupId: teacherId,
    teacherFirstName: `T${teacherId}`,
    teacherLastName: '',
    roomName: null,
  })
  return {
    schedule: [
      {
        classId,
        turns: [
          {
            name: 'TURNUS 1',
            period: 'PM',
            weeks: turn1.map(date => ({ date, isHoliday: false })),
          },
          {
            name: 'TURNUS 2',
            period: 'PM',
            weeks: turn2.map(date => ({ date, isHoliday: false })),
          },
        ],
      },
    ],
    students: [
      { id: classId * 100 + 1, firstName: 'A', lastName: 'A', classId, groupId: 1 },
      { id: classId * 100 + 2, firstName: 'B', lastName: 'B', classId, groupId: 2 },
    ],
    // Teacher 1 has group 1 in TURNUS 1 and group 2 in TURNUS 2.
    rotation: [
      { classId, teacherId: 1, groupId: 1, turnId: 'TURNUS 1', period: 'PM' },
      { classId, teacherId: 1, groupId: 2, turnId: 'TURNUS 2', period: 'PM' },
      { classId, teacherId: 2, groupId: 2, turnId: 'TURNUS 1', period: 'PM' },
      { classId, teacherId: 2, groupId: 1, turnId: 'TURNUS 2', period: 'PM' },
    ],
    own: assignmentFor(1),
    all: [assignmentFor(1), assignmentFor(2)],
    classdata: { id: classId, name, classHead: null, classLead: null },
  }
}

function payload(classes: ReturnType<typeof pmClass>[]): TeacherScheduleData {
  return {
    schedules: classes.map(c => c.schedule),
    students: classes.map(c => c.students),
    teacherRotation: classes.flatMap(c => c.rotation),
    assignments: classes.map(c => c.own),
    classAssignments: classes.flatMap(c => c.all),
    classdata: classes.map(c => c.classdata),
  } as unknown as TeacherScheduleData
}

describe('resolveDay with two biweekly classes sharing a weekday', () => {
  // 2AFELC meets on the A-weeks, 3AFELC on the B-weeks of Monday afternoon.
  const data = payload([
    pmClass(1, '2AFELC', ['09.11.26', '23.11.26'], ['07.12.26']),
    pmClass(2, '3AFELC', ['02.11.26', '16.11.26'], ['30.11.26']),
  ])

  it('offers only the class that meets on that date', () => {
    expect(resolveDay(data, new Date(2026, 10, 16)).map(s => s.className)).toEqual(['3AFELC'])
    expect(resolveDay(data, new Date(2026, 10, 23)).map(s => s.className)).toEqual(['2AFELC'])
  })

  it('resolves the group from the Turnus of that date', () => {
    expect(resolveDay(data, new Date(2026, 10, 30))[0]?.groupId).toBe(2)
    expect(resolveDay(data, new Date(2026, 10, 16))[0]?.groupId).toBe(1)
  })

  it('offers nothing outside the plan', () => {
    expect(resolveDay(data, new Date(2027, 0, 4))).toEqual([])
  })
})

describe('resolveDay at a Turnus change', () => {
  // A weekly Friday lane: TURNUS 2 starts on Fri 20.11.26.
  const data = payload([pmClass(1, '1A', ['06.11.26', '13.11.26'], ['20.11.26', '27.11.26'])])

  it('uses the lesson date, not the day it is viewed on', () => {
    // Viewed on Monday 16.11 the Friday lesson is still in the new Turnus.
    const [slot] = resolveDay(data, new Date(2026, 10, 20))
    expect(slot?.turnName).toBe('TURNUS 2')
    expect(slot?.groupId).toBe(2)
    expect(slot?.otherGroups.map(g => g.groupId)).toEqual([1])
  })

  it('does not let the previous week claim the boundary date', () => {
    expect(resolveDay(data, new Date(2026, 10, 13))[0]?.turnName).toBe('TURNUS 1')
    expect(resolveDay(data, new Date(2026, 10, 13))[0]?.remainingWeeks).toBe(0)
  })
})

describe('resolveDay with two weekly classes in the same half-day', () => {
  const data = payload([
    pmClass(1, '2AFELC', ['16.11.26'], ['23.11.26']),
    pmClass(2, '3AFELC', ['16.11.26'], ['23.11.26']),
  ])

  it('returns every class that meets, each with its own key', () => {
    const slots = resolveDay(data, new Date(2026, 10, 16))
    expect(slots.map(s => s.className)).toEqual(['2AFELC', '3AFELC'])
    expect(new Set(slots.map(slotKey)).size).toBe(2)
  })
})
