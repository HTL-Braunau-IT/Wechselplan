import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'

/**
 * The endpoint derives each student's Notenliste term grade for the signed-in
 * teacher, split by semester, straight from NotenEntry rows — reusing the same
 * weighting the Noten grid shows. These assert the derivation, the semester
 * split, and that a teacher can only read a class they teach.
 */

const mockResolveSessionTeacher = vi.hoisted(() => vi.fn())
const mockIsFeatureEnabled = vi.hoisted(() => vi.fn())
const mockAssignmentFindMany = vi.hoisted(() => vi.fn())
const mockSchoolYearFindUnique = vi.hoisted(() => vi.fn())
const mockMembershipFindMany = vi.hoisted(() => vi.fn())
const mockStudentFindMany = vi.hoisted(() => vi.fn())
const mockWeightFindMany = vi.hoisted(() => vi.fn())
const mockWeightClassFindUnique = vi.hoisted(() => vi.fn())
const mockWeightGlobalFindUnique = vi.hoisted(() => vi.fn())
const mockEntryFindMany = vi.hoisted(() => vi.fn())
const mockClassFindUnique = vi.hoisted(() => vi.fn())

vi.mock('@/lib/weekday-groups', () => import('@/test/weekday-groups-passthrough'))
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { name: 'Anna Müller', role: 'teacher' } })),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/entitlements', () => ({ isFeatureEnabled: mockIsFeatureEnabled }))
vi.mock('@/lib/school-year', () => ({ resolveSchoolYearId: vi.fn(async () => 2026) }))
vi.mock('@/lib/session-teacher', () => ({ resolveSessionTeacher: mockResolveSessionTeacher }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacherAssignment: { findMany: mockAssignmentFindMany },
    schoolYear: { findUnique: mockSchoolYearFindUnique },
    classMembership: { findMany: mockMembershipFindMany },
    student: { findMany: mockStudentFindMany },
    notenWeightConfig: { findMany: mockWeightFindMany },
    notenWeightClassConfig: { findUnique: mockWeightClassFindUnique },
    notenWeightGlobalConfig: { findUnique: mockWeightGlobalFindUnique },
    notenEntry: { findMany: mockEntryFindMany },
    class: { findUnique: mockClassFindUnique },
  },
}))

const get = (query: string) =>
  GET(new Request(`http://localhost/api/notensammler/notenliste-suggestions?${query}`))

/** A NotenEntry row that scores `value` on a single category, the rest empty. */
const entry = (studentId: number, date: string, value: number) => ({
  studentId,
  date,
  period: 'AM',
  attendance: 'Anwesend',
  wiederholung1: value,
  wiederholung2: null,
  bericht1: null,
  bericht2: null,
  mitarbeit1: null,
  mitarbeit2: null,
  praktischeArbeit1: null,
  praktischeArbeit2: null,
  notizen: null,
})

describe('GET /api/notensammler/notenliste-suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsFeatureEnabled.mockResolvedValue(true)
    mockResolveSessionTeacher.mockResolvedValue({ id: 7, firstName: 'Anna', lastName: 'Müller' })
    mockAssignmentFindMany.mockResolvedValue([{ groupId: 1 }])
    mockSchoolYearFindUnique.mockResolvedValue({ semesterChangeDate: new Date('2026-02-01') })
    mockMembershipFindMany.mockResolvedValue([{ studentId: 100 }, { studentId: 101 }])
    mockStudentFindMany.mockResolvedValue([
      { id: 100, groupId: 1 },
      { id: 101, groupId: 1 },
    ])
    mockWeightFindMany.mockResolvedValue([])
    mockWeightClassFindUnique.mockResolvedValue(null)
    mockWeightGlobalFindUnique.mockResolvedValue(null)
    mockEntryFindMany.mockResolvedValue([])
    // Normal (non-combined) class → resolveMemberClassIds returns [classId].
    mockClassFindUnique.mockResolvedValue({ isCombined: false })
  })

  it('derives the first-semester term grade as the half-step mean of the day grades', async () => {
    // Two first-semester days scoring 2 and 3 → mean 2.5.
    mockEntryFindMany.mockResolvedValue([entry(100, '2026-01-10', 2), entry(100, '2026-01-20', 3)])

    const response = await get('classId=3')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      suggestions: Record<string, { first: number | null; second: number | null }>
    }
    expect(body.suggestions['100']).toEqual({ first: 2.5, second: null })
    // A student with no entries gets no suggestion at all.
    expect(body.suggestions['101']).toBeUndefined()
  })

  it('splits day grades into semesters at the school year change date', async () => {
    mockEntryFindMany.mockResolvedValue([
      entry(100, '2026-01-15', 1), // first semester
      entry(100, '2026-03-15', 4), // second semester (>= 2026-02-01)
    ])

    const response = await get('classId=3')
    const body = (await response.json()) as {
      suggestions: Record<string, { first: number | null; second: number | null }>
    }
    expect(body.suggestions['100']).toEqual({ first: 1, second: 4 })
  })

  it('applies the class-level weighting when a group has no override of its own', async () => {
    // One day scoring Wiederholung 2 and Bericht 4. Default 25/25/25/25 → 3.0;
    // a class default of 75/25/0/0 → (2·75 + 4·25) / 100 = 2.5. The group has no
    // row of its own, so the class default must be what gets used.
    mockWeightFindMany.mockResolvedValue([])
    mockWeightClassFindUnique.mockResolvedValue({
      weightWiederholung: 75,
      weightBericht: 25,
      weightMitarbeit: 0,
      weightPraktischeArbeit: 0,
    })
    mockEntryFindMany.mockResolvedValue([
      {
        studentId: 100,
        date: '2026-01-10',
        period: 'AM',
        attendance: 'Anwesend',
        wiederholung1: 2,
        wiederholung2: null,
        bericht1: 4,
        bericht2: null,
        mitarbeit1: null,
        mitarbeit2: null,
        praktischeArbeit1: null,
        praktischeArbeit2: null,
        notizen: null,
      },
    ])

    const response = await get('classId=3')
    const body = (await response.json()) as {
      suggestions: Record<string, { first: number | null; second: number | null }>
    }
    expect(body.suggestions['100']).toEqual({ first: 2.5, second: null })
  })

  it('rejects a teacher not assigned to the class', async () => {
    mockAssignmentFindMany.mockResolvedValue([])

    const response = await get('classId=3')
    expect(response.status).toBe(403)
    expect(mockEntryFindMany).not.toHaveBeenCalled()
  })

  it('returns an empty map when the Noten feature is off', async () => {
    mockIsFeatureEnabled.mockResolvedValue(false)

    const response = await get('classId=3')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { suggestions: Record<string, unknown> }
    expect(body.suggestions).toEqual({})
  })

  it('requires a classId', async () => {
    const response = await get('')
    expect(response.status).toBe(400)
  })
})
