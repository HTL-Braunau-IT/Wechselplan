import type { TransferStatus } from '@/lib/notenmanagement/types'

export interface Student {
	id: number
	firstName: string
	lastName: string
	groupId: number | null
}

export interface Teacher {
	id: number
	firstName: string
	lastName: string
}

export interface ClassData {
	id: number
	name: string
	description: string | null
	subjectName?: string
	hasSeparateAmPmSubjects?: boolean
	subjectNameAm?: string
	subjectNamePm?: string
	classLead?: string | null
	students: Student[]
	amTeachers: Teacher[]
	pmTeachers: Teacher[]
	transferStatus?: TransferStatus
}

export type FinalGradesData = Record<
	number,
	{
		first: number | null
		second: number | null
		conductWishFirst: string | null
		conductWishSecond: string | null
	}
>

export type TeacherClassSummary = {
	id: number
	name: string
	allGradesEnteredFirst: boolean
	allGradesEnteredSecond: boolean
}

export type Period = 'AM' | 'PM'
export type SortField = 'lastName' | 'groupId'
export type SortDirection = 'asc' | 'desc'
