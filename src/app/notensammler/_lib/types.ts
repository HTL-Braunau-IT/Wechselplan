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
  /** Groups are per weekday: the day whose grouping `students[].groupId` shows. */
  groupWeekday?: number | null
  /** Every weekday the class has a plan on (offered as a day switch when > 1). */
  weekdays?: number[]
  subjectName?: string
  hasSeparateAmPmSubjects?: boolean
  subjectNameAm?: string
  subjectNamePm?: string
  classLead?: string | null
  classLeadId?: number | null
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

/**
 * Which half of the year the grid shows. Replaces the pair of independent
 * "1. Semester anzeigen" / "2. Semester anzeigen" checkboxes, which allowed a
 * fourth, useless state (both off) and read as two unrelated settings.
 */
export type SemesterView = 'first' | 'second' | 'both'
