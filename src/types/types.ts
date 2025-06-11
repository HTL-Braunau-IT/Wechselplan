export type ScheduleWeek = {
    date: string
    week: string
    isHoliday: boolean
}

export type ScheduleTerm = {
    name: string
    weeks: ScheduleWeek[]
}

export type Schedule = {
    id: string
    classId: string
    selectedWeekday: number
    scheduleData: Record<string, ScheduleTerm>
    additionalInfo?: string
}

export interface Student {
    id: number
    firstName: string
    lastName: string
    classId: number
    groupId: number
}

export interface Holiday {
    id: number
    name: string
    startDate: string
    endDate: string
  }

export interface Group {
    id: number
    students: Student[]
}

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
}

export interface ScheduleTime {
    id: string
    startTime: string
    endTime: string
    hours: number
    period: 'AM' | 'PM'
}

export interface BreakTime {
    id: string
    name: string
    startTime: string
    endTime: string
    period: 'AM' | 'PM'
}

export type TurnSchedule = Record<string, unknown>

export type TeacherRotation = {
    id: string
    teacherId: string
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
}

export interface ScheduleResponse {
    id: number
    name: string
    description?: string
    startDate: string
    endDate: string
    selectedWeekday: number
    scheduleData: unknown
    additionalInfo?: string
    classId?: number
}