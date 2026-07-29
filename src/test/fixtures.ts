import type {
  Class,
  ClassMembership,
  Schedule,
  SchoolYear,
  Student,
  Teacher,
  TeacherAssignment,
  TeacherRotation,
} from '@prisma/client'

/**
 * Factories for complete Prisma rows in tests.
 *
 * Route tests mock Prisma and feed object literals to `mockResolvedValue`,
 * which type-checks against the real row type. Written out by hand, those
 * literals go stale on every migration: the sync lifecycle columns and
 * `Schedule.schoolYearId` each broke every fixture that predated them, which
 * is how `npm run typecheck` ended up with 38 errors while `src/` itself was
 * clean.
 *
 * Each factory returns a full row and takes partial overrides, so a test only
 * states the fields it actually cares about and a new column needs a default
 * in exactly one place.
 */

/** Fixed so snapshots and equality assertions stay stable across runs. */
const EPOCH = new Date('2026-01-01T00:00:00.000Z')

const timestamps = { createdAt: EPOCH, updatedAt: EPOCH }

/** Directory-sync lifecycle columns, shared by Student, Teacher and Class. */
const syncColumns = {
  externalId: null,
  externalSource: null,
  isActive: true,
  deactivatedAt: null,
  lastSyncedAt: null,
}

export function makeTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: 1,
    firstName: 'Test',
    lastName: 'Teacher',
    username: 'test.teacher',
    email: null,
    ...timestamps,
    ...syncColumns,
    ...overrides,
  }
}

export function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 1,
    firstName: 'Test',
    lastName: 'Student',
    username: 'test.student',
    email: null,
    classId: null,
    groupId: null,
    sitzplatz: null,
    syncStatus: null,
    ...timestamps,
    ...syncColumns,
    ...overrides,
  }
}

export function makeClass(overrides: Partial<Class> = {}): Class {
  return {
    id: 1,
    name: '1AHIT',
    description: null,
    classHeadId: null,
    classLeadId: null,
    ...timestamps,
    ...syncColumns,
    ...overrides,
  }
}

export function makeSchoolYear(overrides: Partial<SchoolYear> = {}): SchoolYear {
  return {
    id: 1,
    label: '2025/2026',
    startDate: new Date('2025-09-01T00:00:00.000Z'),
    endDate: new Date('2026-07-10T00:00:00.000Z'),
    semesterChangeDate: new Date('2026-02-06T00:00:00.000Z'),
    isCurrent: true,
    ...timestamps,
    ...overrides,
  }
}

export function makeTeacherAssignment(
  overrides: Partial<TeacherAssignment> = {},
): TeacherAssignment {
  return {
    id: 1,
    classId: 1,
    groupId: 1,
    teacherId: 1,
    subjectId: 1,
    learningContentId: 1,
    roomId: 1,
    period: '1',
    selectedWeekday: 1,
    schoolYearId: 1,
    ...timestamps,
    ...overrides,
  }
}

export function makeTeacherRotation(overrides: Partial<TeacherRotation> = {}): TeacherRotation {
  return {
    id: 1,
    classId: 1,
    groupId: 1,
    teacherId: 1,
    turnId: 'turn1',
    period: '1',
    ...timestamps,
    ...overrides,
  }
}

export function makeClassMembership(overrides: Partial<ClassMembership> = {}): ClassMembership {
  return {
    id: 1,
    studentId: 1,
    classId: 1,
    schoolYearId: 1,
    ...timestamps,
    ...overrides,
  }
}

export function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 1,
    name: 'Test Schedule',
    description: null,
    startDate: new Date('2025-09-01T00:00:00.000Z'),
    endDate: new Date('2026-07-10T00:00:00.000Z'),
    selectedWeekday: 1,
    scheduleData: null,
    additionalInfo: null,
    semesterPlanning: null,
    classId: null,
    schoolYearId: 1,
    createdById: null,
    ...timestamps,
    ...overrides,
  }
}
