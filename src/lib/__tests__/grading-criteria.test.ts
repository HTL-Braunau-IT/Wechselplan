import { beforeEach, describe, expect, test, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { studentPlanDays } from '@/lib/weekday-groups'
import {
  GradingCriteriaError,
  newShareToken,
  pickCriteria,
  saveTeacherCriteria,
  studentGradingCriteria,
} from '@/lib/grading-criteria'
import { compactGradingCriteriaContent } from '@/types/grading-criteria'

vi.mock('@/lib/weekday-groups', () => import('@/test/weekday-groups-passthrough'))

const tx = {
  gradingCriteria: {
    create: vi.fn(async () => ({ id: 7 })),
    update: vi.fn(async () => ({ id: 7 })),
    updateMany: vi.fn(),
  },
  gradingCriteriaClass: { deleteMany: vi.fn(), createMany: vi.fn() },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gradingCriteria: { findUnique: vi.fn(), findMany: vi.fn() },
    gradingCriteriaClass: { findMany: vi.fn(async () => []) },
    teacherAssignment: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  },
}))

const content = { intro: '', sections: [], closing: '' }
const input = (over: object = {}) => ({
  title: 'Werkstätte',
  subtitle: '  ',
  content,
  isDefault: false,
  classIds: [] as number[],
  ...over,
})

describe('pickCriteria', () => {
  const def = { id: 1, isDefault: true, classes: [] }
  const plan = { id: 2, isDefault: false, classes: [{ classId: 99 }] }
  const own = { id: 3, isDefault: false, classes: [{ classId: 10 }] }

  test('prefers the plan class, then the own class, then the default', () => {
    expect(pickCriteria([def, plan, own], [99, 10])?.id).toBe(2)
    expect(pickCriteria([def, own], [99, 10])?.id).toBe(3)
    expect(pickCriteria([def], [99, 10])?.id).toBe(1)
  })

  test('returns null when nothing applies', () => {
    expect(pickCriteria([own], [99])).toBeNull()
  })
})

test('newShareToken is URL-safe and unique', () => {
  const a = newShareToken()
  expect(a).toMatch(/^[A-Za-z0-9_-]{24}$/)
  expect(newShareToken()).not.toBe(a)
})

test('compactGradingCriteriaContent drops blank rows but keeps title-less criteria', () => {
  expect(
    compactGradingCriteriaContent({
      intro: ' Hallo ',
      closing: '',
      sections: [
        { title: 'Mitarbeit', criteria: [{ title: '', points: ['a', ' ', ''] }] },
        { title: ' ', criteria: [{ title: ' ', points: [''] }] },
      ],
    }),
  ).toEqual({
    intro: 'Hallo',
    closing: '',
    sections: [{ title: 'Mitarbeit', criteria: [{ title: '', points: ['a'] }] }],
  })
})

describe('saveTeacherCriteria', () => {
  beforeEach(() => vi.clearAllMocks())

  test("rejects another teacher's template as not found", async () => {
    vi.mocked(prisma.gradingCriteria.findUnique).mockResolvedValue({
      teacherId: 2,
      classes: [],
    } as never)
    await expect(saveTeacherCriteria(1, 7, input())).rejects.toMatchObject({ status: 404 })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('rejects a class the teacher does not teach', async () => {
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([{ classId: 10 }] as never)
    const err = await saveTeacherCriteria(1, null, input({ classIds: [10, 11] })).catch(e => e)
    expect(err).toBeInstanceOf(GradingCriteriaError)
    expect(err.status).toBe(403)
  })

  test('a new default clears the old one and classes move onto this template', async () => {
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([{ classId: 10 }] as never)

    const id = await saveTeacherCriteria(1, null, input({ isDefault: true, classIds: [10, 10] }))

    expect(id).toBe(7)
    expect(tx.gradingCriteria.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ teacherId: 1, subtitle: null, isDefault: true }),
    })
    expect(tx.gradingCriteria.updateMany).toHaveBeenCalledWith({
      where: { teacherId: 1, isDefault: true, id: { not: 7 } },
      data: { isDefault: false },
    })
    expect(tx.gradingCriteriaClass.deleteMany).toHaveBeenCalledWith({
      where: { teacherId: 1, OR: [{ criteriaId: 7 }, { classId: { in: [10] } }] },
    })
    expect(tx.gradingCriteriaClass.createMany).toHaveBeenCalledWith({
      data: [{ criteriaId: 7, teacherId: 1, classId: 10 }],
    })
  })
})

describe('studentGradingCriteria', () => {
  beforeEach(() => vi.clearAllMocks())

  const teacher = (id: number, lastName: string) => ({ id, firstName: 'T', lastName })
  const template = (id: number, teacherId: number, over: object = {}) => ({
    id,
    teacherId,
    title: `Tpl ${id}`,
    subtitle: null,
    content,
    isDefault: false,
    updatedAt: new Date('2026-09-01'),
    teacher: teacher(teacherId, `L${teacherId}`),
    classes: [],
    ...over,
  })

  test('lists each plan teacher once with the template for the combined plan class', async () => {
    vi.mocked(studentPlanDays).mockResolvedValue([
      { weekday: 1, planClassId: 99, groupId: 1 },
      { weekday: 3, planClassId: 10, groupId: 1 },
    ] as never)
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      { classId: 99, teacher: teacher(5, 'Buttinger'), subject: { name: 'Werkstätte' } },
      { classId: 10, teacher: teacher(5, 'Buttinger'), subject: { name: 'Werkstätte' } },
      { classId: 10, teacher: teacher(6, 'Anders'), subject: { name: 'Labor' } },
      { classId: 10, teacher: teacher(8, 'Ohne'), subject: { name: 'Labor' } },
    ] as never)
    vi.mocked(prisma.gradingCriteria.findMany).mockResolvedValue([
      template(1, 5, { isDefault: true }),
      template(2, 5, { classes: [{ classId: 99 }] }),
      template(3, 6, { isDefault: true }),
    ] as never)

    const result = await studentGradingCriteria({ id: 1, classId: 10, groupId: 1 }, 2026)

    expect(prisma.teacherAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          schoolYearId: 2026,
          OR: [
            { classId: 99, selectedWeekday: 1 },
            { classId: 10, selectedWeekday: 3 },
          ],
        }),
      }),
    )
    // Sorted by last name; teacher 8 has no criteria and is left out.
    expect(result.map(r => [r.teacherId, r.criteria.title, r.subjects])).toEqual([
      [6, 'Tpl 3', ['Labor']],
      [5, 'Tpl 2', ['Werkstätte']],
    ])
  })

  test('a student without plan days gets nothing', async () => {
    vi.mocked(studentPlanDays).mockResolvedValue([])
    expect(await studentGradingCriteria({ id: 1, classId: 10, groupId: null }, 2026)).toEqual([])
    expect(prisma.teacherAssignment.findMany).not.toHaveBeenCalled()
  })
})
