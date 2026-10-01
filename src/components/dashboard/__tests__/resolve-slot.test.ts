import { describe, expect, it } from 'vitest'
import type { TeacherScheduleData } from '@/types/types'
import { resolveDay } from '../resolve-slot'

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
