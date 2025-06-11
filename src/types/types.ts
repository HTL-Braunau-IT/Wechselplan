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

export type Student = {
    id: number
    classId: number | null
    groupId: number | null
    firstName: string
    lastName: string

}

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