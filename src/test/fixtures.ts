import type { Class, Schedule, SchoolYear, Student, Teacher, TeacherAssignment } from '@prisma/client'

/**
 * Prisma-shaped fixtures for route tests.
 *
 * Route tests mock Prisma and hand the mock a plain object. Those objects used
 * to be spelled out inline, so every schema migration (the Entra sync columns,
 * the school-year models) broke `tsc` in a dozen test files at once. Building
 * them here means a new required column is one edit, not twenty.
 *
 * Each factory returns a complete row and takes a partial override for the
 * fields a given test actually cares about.
 */

const EPOCH = new Date('2026-01-01T00:00:00.000Z')

export function makeStudent(overrides: Partial<Student> = {}): Student {
	return {
		id: 1,
		firstName: 'John',
		lastName: 'Doe',
		classId: null,
		groupId: null,
		sitzplatz: null,
		createdAt: EPOCH,
		updatedAt: EPOCH,
		username: 'john.doe',
		email: null,
		externalId: null,
		externalSource: null,
		isActive: true,
		deactivatedAt: null,
		lastSyncedAt: null,
		syncStatus: null,
		...overrides
	}
}

export function makeTeacher(overrides: Partial<Teacher> = {}): Teacher {
	return {
		id: 1,
		firstName: 'Jane',
		lastName: 'Smith',
		createdAt: EPOCH,
		updatedAt: EPOCH,
		username: 'jane.smith',
		email: null,
		externalId: null,
		externalSource: null,
		isActive: true,
		deactivatedAt: null,
		lastSyncedAt: null,
		...overrides
	}
}

export function makeClass(overrides: Partial<Class> = {}): Class {
	return {
		id: 1,
		name: '1AHELS',
		description: null,
		createdAt: EPOCH,
		updatedAt: EPOCH,
		classHeadId: null,
		classLeadId: null,
		externalId: null,
		externalSource: null,
		isActive: true,
		deactivatedAt: null,
		lastSyncedAt: null,
		...overrides
	}
}

export function makeTeacherAssignment(
	overrides: Partial<TeacherAssignment> = {}
): TeacherAssignment {
	return {
		id: 1,
		classId: 1,
		period: 'AM',
		groupId: 1,
		teacherId: 1,
		subjectId: 1,
		learningContentId: 1,
		roomId: 1,
		selectedWeekday: 1,
		schoolYearId: 1,
		createdAt: EPOCH,
		updatedAt: EPOCH,
		...overrides
	}
}

export function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
	return {
		id: 1,
		name: 'Schedule 1',
		description: null,
		startDate: new Date('2026-01-01T00:00:00.000Z'),
		endDate: new Date('2026-01-31T00:00:00.000Z'),
		selectedWeekday: 1,
		// Deprecated column, null for every schedule since the turn normalisation.
		scheduleData: null,
		additionalInfo: null,
		semesterPlanning: null,
		classId: 1,
		schoolYearId: 1,
		createdAt: EPOCH,
		updatedAt: EPOCH,
		...overrides
	}
}

export function makeSchoolYear(overrides: Partial<SchoolYear> = {}): SchoolYear {
	return {
		id: 1,
		label: '2025/2026',
		startDate: new Date('2025-09-01T00:00:00.000Z'),
		endDate: new Date('2026-07-31T00:00:00.000Z'),
		semesterChangeDate: new Date('2026-02-06T00:00:00.000Z'),
		isCurrent: true,
		createdAt: EPOCH,
		updatedAt: EPOCH,
		...overrides
	}
}
