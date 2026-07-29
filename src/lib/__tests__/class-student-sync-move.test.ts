import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Covers the class-move half of the sync lifecycle that
 * `docs/ENTRA_MIGRATION.md` listed as untested: what happens to a student's
 * rotation group and to a renamed class's `GroupAssignment` rows.
 *
 * Prisma is faked rather than seeded — the assertions are about which writes
 * `applyClassStudentSync` issues, not about the database enforcing them.
 */

const getGroup = vi.fn()
const collectGroupMembers = vi.fn()
const getSyncedClassGroupIds = vi.fn<() => Promise<string[]>>()
const recordSyncRun = vi.fn()

vi.mock('@/lib/graph', () => ({ getGroup, collectGroupMembers }))
vi.mock('@/lib/directory-sync-settings', () => ({ getSyncedClassGroupIds, recordSyncRun }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const SCHOOL_YEAR = { id: 7, label: '2025/2026' }

const GROUP_A = { id: 'group-a-oid', displayName: '1AHIT', description: null }
const GROUP_B = { id: 'group-b-oid', displayName: '1BHIT', description: null }

/** Class rows as they exist locally before the run. */
let classRows: Array<Record<string, unknown>>
/** Student rows as they exist locally before the run. */
let studentRows: Array<Record<string, unknown>>

const studentUpdates: Array<{ where: unknown; data: Record<string, unknown> }> = []
const classUpdates: Array<{ where: unknown; data: Record<string, unknown> }> = []
const groupAssignmentDeletes: Array<Record<string, unknown>> = []
const groupAssignmentUpdates: Array<{ where: unknown; data: Record<string, unknown> }> = []
const membershipUpserts: Array<Record<string, unknown>> = []

const tx = {
  class: {
    create: vi.fn(async ({ data }: { data: { name: string } }) => ({ id: 900, ...data })),
    update: vi.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
      classUpdates.push(args)
      return { id: 1 }
    }),
    findUnique: vi.fn(async () => null),
  },
  student: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 901, ...data })),
    update: vi.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
      studentUpdates.push(args)
      return { id: 1 }
    }),
  },
  classMembership: {
    upsert: vi.fn(async (args: Record<string, unknown>) => {
      membershipUpserts.push(args)
      return {}
    }),
  },
  groupAssignment: {
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      groupAssignmentDeletes.push(where)
      return { count: 0 }
    }),
    updateMany: vi.fn(async (args: { where: unknown; data: Record<string, unknown> }) => {
      groupAssignmentUpdates.push(args)
      return { count: 0 }
    }),
  },
}

vi.mock('@/lib/prisma', () => ({
  ANY_ACTIVE_STATE: { not: undefined },
  prisma: {
    schoolYear: {
      findUnique: vi.fn(async () => SCHOOL_YEAR),
      findFirst: vi.fn(async () => SCHOOL_YEAR),
    },
    class: { findMany: vi.fn(async () => classRows) },
    student: { findMany: vi.fn(async () => studentRows) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  },
}))

function entraMember(oid: string, firstName: string, lastName: string) {
  return {
    id: oid,
    givenName: firstName,
    surname: lastName,
    userPrincipalName: `${firstName}.${lastName}@school.at`.toLowerCase(),
    mail: `${firstName}.${lastName}@school.at`.toLowerCase(),
    displayName: `${firstName} ${lastName}`,
  }
}

function localClass(id: number, name: string, externalId: string | null) {
  return {
    id,
    name,
    description: null,
    externalId,
    externalSource: externalId ? 'entra' : null,
    isActive: true,
  }
}

async function loadSync() {
  return import('@/lib/class-student-sync')
}

beforeEach(() => {
  vi.clearAllMocks()
  studentUpdates.length = 0
  classUpdates.length = 0
  groupAssignmentDeletes.length = 0
  groupAssignmentUpdates.length = 0
  membershipUpserts.length = 0
  getSyncedClassGroupIds.mockResolvedValue([GROUP_A.id, GROUP_B.id])
  getGroup.mockImplementation(async (id: string) =>
    id === GROUP_A.id ? GROUP_A : id === GROUP_B.id ? GROUP_B : null,
  )
})

describe('a student moved between classes in Entra', () => {
  beforeEach(() => {
    classRows = [localClass(1, '1AHIT', GROUP_A.id), localClass(2, '1BHIT', GROUP_B.id)]
    studentRows = [
      {
        id: 50,
        firstName: 'Anna',
        lastName: 'Huber',
        username: 'anna.huber',
        email: 'anna.huber@school.at',
        classId: 1,
        groupId: 2,
        externalId: 'anna-oid',
        externalSource: 'entra',
        isActive: true,
        syncStatus: 'active',
        class: { name: '1AHIT' },
      },
    ]
    // Anna now sits in 1BHIT only.
    collectGroupMembers.mockImplementation(async (groupId: string) =>
      groupId === GROUP_B.id ? [entraMember('anna-oid', 'Anna', 'Huber')] : [],
    )
  })

  it('reports the class move and the rotation group it costs', async () => {
    const { previewClassStudentSync } = await loadSync()
    const diff = await previewClassStudentSync()

    expect(diff.students.toUpdate).toHaveLength(1)
    const update = diff.students.toUpdate[0]!
    expect(update.changes).toContain('class')
    expect(update.classChange).toEqual({
      fromClassName: '1AHIT',
      toGroupDisplayName: '1BHIT',
      clearedGroupId: 2,
    })
  })

  it('clears the rotation group so the student lands in the unassigned bucket', async () => {
    const { applyClassStudentSync } = await loadSync()
    await applyClassStudentSync()

    expect(studentUpdates).toHaveLength(1)
    expect(studentUpdates[0]!.where).toEqual({ id: 50 })
    expect(studentUpdates[0]!.data.groupId).toBeNull()
    expect(studentUpdates[0]!.data.class).toEqual({ connect: { id: 2 } })
  })

  it('moves the ClassMembership row for the school year to the new class', async () => {
    const { applyClassStudentSync } = await loadSync()
    await applyClassStudentSync()

    expect(membershipUpserts).toHaveLength(1)
    expect(membershipUpserts[0]).toMatchObject({
      where: { studentId_schoolYearId: { studentId: 50, schoolYearId: SCHOOL_YEAR.id } },
      update: { classId: 2 },
    })
  })
})

describe('a student whose profile changed but whose class did not', () => {
  beforeEach(() => {
    classRows = [localClass(1, '1AHIT', GROUP_A.id), localClass(2, '1BHIT', GROUP_B.id)]
    studentRows = [
      {
        id: 51,
        firstName: 'Anna',
        lastName: 'Alt',
        username: 'anna.huber',
        email: 'anna.huber@school.at',
        classId: 1,
        groupId: 2,
        externalId: 'anna-oid',
        externalSource: 'entra',
        isActive: true,
        syncStatus: 'active',
        class: { name: '1AHIT' },
      },
    ]
    collectGroupMembers.mockImplementation(async (groupId: string) =>
      groupId === GROUP_A.id ? [entraMember('anna-oid', 'Anna', 'Huber')] : [],
    )
  })

  it('keeps the rotation group', async () => {
    const { applyClassStudentSync } = await loadSync()
    await applyClassStudentSync()

    expect(studentUpdates).toHaveLength(1)
    expect(studentUpdates[0]!.data.lastName).toBe('Huber')
    expect(studentUpdates[0]!.data).not.toHaveProperty('groupId')
  })
})

describe('a deactivated student reappearing in a different class', () => {
  beforeEach(() => {
    classRows = [localClass(1, '1AHIT', GROUP_A.id), localClass(2, '1BHIT', GROUP_B.id)]
    studentRows = [
      {
        id: 52,
        firstName: 'Anna',
        lastName: 'Huber',
        username: 'anna.huber',
        email: 'anna.huber@school.at',
        classId: 1,
        groupId: 2,
        externalId: 'anna-oid',
        externalSource: 'entra',
        isActive: false,
        syncStatus: 'active',
        class: { name: '1AHIT' },
      },
    ]
    collectGroupMembers.mockImplementation(async (groupId: string) =>
      groupId === GROUP_B.id ? [entraMember('anna-oid', 'Anna', 'Huber')] : [],
    )
  })

  it('shows the class move and the group it costs before applying', async () => {
    const { previewClassStudentSync } = await loadSync()
    const diff = await previewClassStudentSync()

    expect(diff.students.toReactivate).toHaveLength(1)
    expect(diff.students.toReactivate[0]!.classChange).toEqual({
      fromClassName: '1AHIT',
      toGroupDisplayName: '1BHIT',
      clearedGroupId: 2,
    })
  })

  it('clears the rotation group on apply', async () => {
    const { applyClassStudentSync } = await loadSync()
    await applyClassStudentSync()

    expect(studentUpdates).toHaveLength(1)
    expect(studentUpdates[0]!.data).toMatchObject({
      classId: 2,
      groupId: null,
      isActive: true,
      deactivatedAt: null,
    })
  })
})

describe('a deactivated student reappearing in the same class', () => {
  beforeEach(() => {
    classRows = [localClass(1, '1AHIT', GROUP_A.id), localClass(2, '1BHIT', GROUP_B.id)]
    studentRows = [
      {
        id: 53,
        firstName: 'Anna',
        lastName: 'Huber',
        username: 'anna.huber',
        email: 'anna.huber@school.at',
        classId: 1,
        groupId: 2,
        externalId: 'anna-oid',
        externalSource: 'entra',
        isActive: false,
        syncStatus: 'active',
        class: { name: '1AHIT' },
      },
    ]
    collectGroupMembers.mockImplementation(async (groupId: string) =>
      groupId === GROUP_A.id ? [entraMember('anna-oid', 'Anna', 'Huber')] : [],
    )
  })

  it('keeps the rotation group they left with', async () => {
    const { applyClassStudentSync } = await loadSync()
    await applyClassStudentSync()

    expect(studentUpdates).toHaveLength(1)
    expect(studentUpdates[0]!.data.isActive).toBe(true)
    expect(studentUpdates[0]!.data).not.toHaveProperty('groupId')
  })
})

describe('a class renamed in Entra', () => {
  beforeEach(() => {
    classRows = [localClass(1, '1AHIT', GROUP_A.id)]
    studentRows = []
    getSyncedClassGroupIds.mockResolvedValue([GROUP_A.id])
    getGroup.mockImplementation(async (id: string) =>
      id === GROUP_A.id ? { ...GROUP_A, displayName: '2AHIT' } : null,
    )
    collectGroupMembers.mockResolvedValue([])
  })

  it('carries the rotation groups over to the new class name', async () => {
    const { applyClassStudentSync } = await loadSync()
    await applyClassStudentSync()

    expect(groupAssignmentUpdates).toEqual([
      { where: { class: '1AHIT' }, data: { class: '2AHIT' } },
    ])
    // Any rows already parked under the new name are orphans of an older rename.
    expect(groupAssignmentDeletes).toEqual([{ class: '2AHIT' }])
    expect(classUpdates[0]!.data.name).toBe('2AHIT')
  })
})
