import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UNGROUPED_SECTION_ID,
  buildKlassenlisteView,
  getClassRoster,
  isWritingSpace,
  shortSchoolYearLabel,
  type RosterStudent,
} from '../klassenliste'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/weekday-groups', () => import('@/test/weekday-groups-passthrough'))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: { findUnique: vi.fn() },
    schoolYear: { findUnique: vi.fn() },
    classMembership: { findMany: vi.fn() },
    student: { findMany: vi.fn() },
    schedule: { findMany: vi.fn(async () => [{ selectedWeekday: 1 }, { selectedWeekday: 4 }]) },
  },
}))

// getClassRoster expands combined classes via this helper; a normal class is [id].
vi.mock('@/lib/combined-classes', () => ({
  resolveMemberClassIds: vi.fn(async (id: number) => [id]),
}))

const s = (id: number, lastName: string, groupId: number | null): RosterStudent => ({
  id,
  firstName: 'Max',
  lastName,
  groupId,
})

describe('shortSchoolYearLabel', () => {
  it('shortens the four/four form', () => {
    expect(shortSchoolYearLabel('2026/2027')).toBe('2026/27')
  })
  it('leaves other forms unchanged', () => {
    expect(shortSchoolYearLabel('2026/27')).toBe('2026/27')
    expect(shortSchoolYearLabel('SJ 26')).toBe('SJ 26')
  })
})

describe('isWritingSpace', () => {
  it('accepts the four layouts and rejects anything else', () => {
    expect(isWritingSpace('split')).toBe(true)
    expect(isWritingSpace('blank')).toBe(true)
    expect(isWritingSpace('grid')).toBe(false)
    expect(isWritingSpace(null)).toBe(false)
  })
})

describe('buildKlassenlisteView', () => {
  it('returns a flat list when no student has a group', () => {
    const view = buildKlassenlisteView([s(1, 'Aigner', null), s(2, 'Brunner', null)])
    expect(view.hasPlan).toBe(false)
    expect(view.sections).toEqual([])
    expect(view.plain).toHaveLength(2)
    expect(view.total).toBe(2)
  })

  it('buckets students into sorted group sections', () => {
    const view = buildKlassenlisteView([
      s(1, 'Aigner', 2),
      s(2, 'Brunner', 1),
      s(3, 'Ebner', 1),
      s(4, 'Gruber', 2),
    ])
    expect(view.hasPlan).toBe(true)
    expect(view.sections.map(sec => sec.id)).toEqual([1, 2])
    expect(view.sections[0]!.students.map(p => p.lastName)).toEqual(['Brunner', 'Ebner'])
    expect(view.total).toBe(4)
  })

  it('keeps unassigned students in a trailing ungrouped section', () => {
    const view = buildKlassenlisteView([s(1, 'Aigner', 1), s(2, 'Brunner', null)])
    expect(view.sections.map(sec => sec.id)).toEqual([1, UNGROUPED_SECTION_ID])
    expect(view.sections[1]!.students).toHaveLength(1)
    expect(view.total).toBe(2)
  })

  it('honours a group filter and recomputes the total', () => {
    const view = buildKlassenlisteView(
      [s(1, 'Aigner', 1), s(2, 'Brunner', 2), s(3, 'Ebner', 2)],
      [2],
    )
    expect(view.sections.map(sec => sec.id)).toEqual([2])
    expect(view.total).toBe(2)
  })
})

describe('getClassRoster', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null for a missing class', async () => {
    vi.mocked(prisma.class.findUnique).mockResolvedValue(null as never)
    await expect(getClassRoster(1, 1)).resolves.toBeNull()
  })

  it('assembles class metadata and a year-scoped roster', async () => {
    vi.mocked(prisma.class.findUnique).mockResolvedValue({
      id: 7,
      name: '4AHME',
      classHead: { firstName: 'Andrea', lastName: 'Huber' },
      classLead: { firstName: 'Martin', lastName: 'Reiter' },
    } as never)
    vi.mocked(prisma.schoolYear.findUnique).mockResolvedValue({ label: '2026/2027' } as never)
    vi.mocked(prisma.classMembership.findMany).mockResolvedValue([
      { studentId: 1 },
      { studentId: 2 },
    ] as never)
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      { id: 1, firstName: 'Lukas', lastName: 'Aigner', groupId: 1 },
      { id: 2, firstName: 'Sophie', lastName: 'Brunner', groupId: 2 },
    ] as never)

    const roster = await getClassRoster(7, 42)
    expect(roster).not.toBeNull()
    expect(roster!.className).toBe('4AHME')
    expect(roster!.classHead).toBe('Andrea Huber')
    expect(roster!.classLead).toBe('Martin Reiter')
    expect(roster!.schoolYearLabel).toBe('2026/27')
    expect(roster!.students).toHaveLength(2)
    // The class's planned days, offered as the day switch.
    expect(roster!.weekdays).toEqual([1, 4])
  })
})
