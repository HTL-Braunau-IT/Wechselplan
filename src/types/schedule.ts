/**
 * Consolidated type definitions for schedule-related functionality.
 * This file serves as the single source of truth for schedule types.
 */

export type ScheduleWeek = {
	date: string
	week: string
	isHoliday: boolean
}

export type ScheduleTerm = {
	name: string
	weeks: ScheduleWeek[]
	holidays?: Holiday[]
	customLength?: number
}

export type ScheduleEntry = {
	name: string
	weeks: ScheduleWeek[]
	holidays: Holiday[]
	customLength?: number
}

export type Schedule = Record<string, ScheduleEntry>

export interface ScheduleResponse {
	id: number
	name: string
	description?: string
	startDate: string
	endDate: string
	selectedWeekday: number
	scheduleData: unknown
	additionalInfo?: string
	semesterPlanning?: string | null
	classId?: number
	createdAt: string
	updatedAt?: string
	turns?: Array<{
		name: string
		customLength?: number | null
		weeks: Array<{
			date: string
			week: string
			isHoliday: boolean
		}>
		holidays?: Array<{
			holiday: {
				id: number
				name: string
				startDate: Date | string
				endDate: Date | string
			}
		}>
	}>
}

export interface ScheduleTime {
	id: number
	startTime: string
	endTime: string
	hours: number
	period: 'AM' | 'PM'
	createdAt?: string
	updatedAt?: string
}

// For backward compatibility with old string ID format
export interface ScheduleTimeLegacy {
	id: string | number
	startTime: string
	endTime: string
	hours: number
	period: 'AM' | 'PM'
}

export interface BreakTime {
	id: number
	name: string
	startTime: string
	endTime: string
	period: 'AM' | 'PM' | 'LUNCH'
	createdAt?: string
	updatedAt?: string
}

export interface Holiday {
	id: number
	name: string
	startDate: Date | string
	endDate: Date | string
}

export type TurnSchedule = Record<string, ScheduleTerm>

export interface TeacherAssignmentResponse {
	groupId: number
	teacherId: number
	subject: string
	learningContent: string
	room: string
	teacherLastName: string
	teacherFirstName: string
}

export interface TeacherAssignmentsResponse {
	amAssignments: TeacherAssignmentResponse[]
	pmAssignments: TeacherAssignmentResponse[]
	selectedWeekday?: number
}

export interface GroupAssignment {
	groupId: number
	studentIds: number[]
}

export interface AssignmentsResponse {
	assignments: GroupAssignment[]
	unassignedStudents: Student[]
}

// Re-export Student and Group from types.ts for convenience
export type { Student, Group } from './types'

