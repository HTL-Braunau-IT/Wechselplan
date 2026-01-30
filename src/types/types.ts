// Schedule-related types moved to schedule.ts - re-export for backward compatibility
export type {
    ScheduleWeek,
    ScheduleTerm,
    ScheduleEntry,
    Schedule,
    ScheduleResponse,
    ScheduleTime,
    BreakTime,
    Holiday,
    TurnSchedule,
    TeacherAssignmentResponse,
    TeacherAssignmentsResponse,
    GroupAssignment,
    AssignmentsResponse
} from './schedule'

export interface Student {
    id: number
    firstName: string
    lastName: string
    classId: number
    groupId: number
}

// Holiday moved to schedule.ts - see re-exports above

export interface Group {
    id: number
    students: Student[]
}

// Types moved to schedule.ts - see re-exports above

export interface Teacher {
    id: number
    firstName: string
    lastName: string
    username: string
}

export interface Class {
    id: number
    name: string
    description: string | null
    classHeadId: number | null
    classLeadId: number | null
}

// Types moved to schedule.ts - see re-exports above

export type TeacherRotation = {
    id: string
    teacherId: string
    classId: number
    groupId: number
    turnId: string
    startDate: Date
    endDate: Date
    period: string

}

export type Assignment = {
    id: number
    teacherId: number
    classId: number
    period: string
    groupId: number
}

export type ScheduleData = {
    schedules: Schedule[][]
    students: Student[][]
    teacherRotation: TeacherRotation[]
    assignments: Assignment[]
    classdata: ClassData[]
   
}

export type ClassData = {
    id: number
    name: string
    classHead: string | null
    classLead: string | null
}

// Types moved to schedule.ts - see re-exports above