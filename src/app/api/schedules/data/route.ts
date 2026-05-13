import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { badRequest, notFound, ok, serverError } from '@/lib/api-response'
import { formatScheduleWeekDate, formatScheduleWeekLabel } from '@/lib/schedule-data-helpers'
import { applyPmTracksToSerializedTurns, isPmBiweeklyAnchor } from '@/lib/pm-biweekly-track'

/**
 * Handles HTTP GET requests to retrieve schedule, student, rotation, assignment, and class information for a specified teacher and weekday.
 *
 * Extracts the `teacher` (required) and `weekday` (optional, defaults to '0') query parameters from the request URL. Validates the teacher's existence, gathers their assignments, rotation data, class details (including class head and lead names), schedules for the given weekday, and students in each class. Returns a JSON response with the aggregated data or an error message in the response body.
 *
 * @returns A {@link NextResponse} containing a JSON object with arrays for schedules, students, teacher rotation, filtered assignments, and class information, or an error message.
 *
 * @remark Teacher not found, no assignments, and invalid weekday use non-200 HTTP codes. When no rotation rows exist for this weekday, `teacherRotation` is an empty array (200) so the overview can still load schedules. Internal errors return 500.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    try {
        type OverviewStudent = {
            id: number
            firstName: string
            lastName: string
            classId: number
            groupId: number | null
        }

        const rawTeacherUsername = searchParams.get('teacher')
        const currentWeekday = searchParams.get('weekday') ?? '0'
        const schoolYearIdParam = searchParams.get('schoolYearId')

        if (!rawTeacherUsername) {
            return badRequest('Teacher username is required')
        }
        const teacherUsername = normalizeUsername(rawTeacherUsername)
        if (!teacherUsername) {
            return badRequest('Teacher username is required')
        }

        const teacher = await prisma.teacher.findUnique({
            where: {
                username: teacherUsername
            }
        })

        if (!teacher) {
            console.warn('[username-match] Teacher not found (schedules/data)', { raw: rawTeacherUsername, normalized: teacherUsername })
            return notFound('Teacher not found')
        }

        let schoolYearId: number | undefined = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined
        if (schoolYearId == null || Number.isNaN(schoolYearId)) {
            const now = new Date()
            const current = await prisma.schoolYear.findFirst({
                where: { startDate: { lte: now }, endDate: { gte: now } },
                select: { id: true }
            })
            schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id
        }

        const ownAssignmentsWhere = schoolYearId != null
            ? { teacherId: teacher.id, schoolYearId }
            : { teacherId: teacher.id }
        const ownAssignments = await prisma.teacherAssignment.findMany({
            where: ownAssignmentsWhere
        })

        if (!ownAssignments || ownAssignments.length === 0) {
            return notFound('No classes assigned to teacher')
        }

        const weekdayNum = parseInt(currentWeekday, 10)
        if (Number.isNaN(weekdayNum) || weekdayNum < 1 || weekdayNum > 5) {
            return badRequest('weekday must be between 1 and 5')
        }

        const teacherRotationRows = await prisma.teacherRotation.findMany({
            where: {
                teacherId: teacher.id,
                ...(schoolYearId != null ? { schoolYearId } : {}),
                selectedWeekday: weekdayNum
            },
            include: {
                turn: { select: { name: true } }
            }
        })

        // Empty rotation is allowed (e.g. before first rotation save, or transient gap). Clients use assignments as fallback.
        const teacherRotation = teacherRotationRows.map(r => ({
            id: r.id,
            classId: r.classId,
            groupId: r.groupId,
            teacherId: r.teacherId,
            turnId: r.turnId,
            turnName: r.turn.name,
            period: r.period,
            schoolYearId: r.schoolYearId,
            selectedWeekday: r.selectedWeekday,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
        }))

        const classIds = [...new Set(ownAssignments.map(assignment => assignment.classId))]
        const schedules = []
        const students: OverviewStudent[][] = []
        const classdata: { id: number; name: string; classHead: string | null; classLead: string | null }[] = []
        const validClassIds = new Set<number>()

        // First fetch all class data (head/lead now resolved per school year via ClassYearStaff).
        for (const classId of classIds) {
            const classInfo = await prisma.class.findUnique({
                where: { id: classId }
            })
            if (!classInfo) continue

            const yearStaff = schoolYearId != null
                ? await prisma.classYearStaff.findUnique({
                      where: { classId_schoolYearId: { classId, schoolYearId } },
                      include: {
                          classHead: { select: { firstName: true, lastName: true } },
                          classLead: { select: { firstName: true, lastName: true } }
                      }
                  })
                : null

            classdata.push({
                id: classInfo.id,
                name: classInfo.name,
                classHead: yearStaff?.classHead ? `${yearStaff.classHead.firstName} ${yearStaff.classHead.lastName}` : null,
                classLead: yearStaff?.classLead ? `${yearStaff.classLead.firstName} ${yearStaff.classLead.lastName}` : null
            })
        }

        // Then fetch schedules and students for each class
        for (const classId of classIds) {
            const schedule = await prisma.schedule.findFirst({
                where: {
                    classId,
                    selectedWeekday: weekdayNum,
                    ...(schoolYearId != null ? { schoolYearId } : {})
                },
                orderBy: {
                    createdAt: 'desc'
                },
                include: {
                    breakTimes: true,
                    scheduleTimes: true,
                    turns: {
                        include: {
                            weeks: true,
                            holidays: {
                                include: {
                                    holiday: true
                                }
                            }
                        },
                        orderBy: {
                            order: 'asc'
                        }
                    }
                }
            })
        
            // Add schedule if it exists for this weekday.
            // Weeks are stored as DATE/INT in the DB; format them back to the
            // legacy "dd.MM.yy" / "KW##" strings so existing clients keep working.
            if (schedule) {
                const anchor = isPmBiweeklyAnchor(schedule.pmBiweeklyAnchor) ? schedule.pmBiweeklyAnchor : null
                const turnsSlim = schedule.turns.map((turn) => ({
                    name: turn.name,
                    order: turn.order,
                    weeks: turn.weeks.map((w) => ({
                        date: formatScheduleWeekDate(w.date),
                        week: formatScheduleWeekLabel(w.week),
                        isHoliday: w.isHoliday,
                        includedInPlan: (w as { includedInPlan?: boolean }).includedInPlan !== false
                    }))
                }))
                const turnsWithPm = applyPmTracksToSerializedTurns(turnsSlim, anchor)
                const formattedSchedule = {
                    ...schedule,
                    turns: schedule.turns.map((turn, turnIdx) => ({
                        ...turn,
                        weeks: turnsWithPm[turnIdx]!.weeks.map((w, widx) => ({
                            ...turn.weeks[widx],
                            date: w.date,
                            week: w.week,
                            isHoliday: w.isHoliday,
                            includedInPlan: w.includedInPlan,
                            pmTrack: (w as { pmTrack?: 'A' | 'B' | null }).pmTrack ?? null
                        }))
                    }))
                }
                schedules.push([formattedSchedule])
                validClassIds.add(classId)
            } else {
                // Add empty array to maintain index alignment with classIds
                schedules.push([])
            }
            
            // Fetch students for this class and derive weekday group membership.
            // Class assignment now lives on ClassMembership (year-scoped); when no
            // school year is in scope, we treat the class as having no students.
            let studentIds: number[] = []
            if (schoolYearId != null) {
                const memberships = await prisma.classMembership.findMany({
                    where: { classId, schoolYearId },
                    select: { studentId: true }
                })
                studentIds = memberships.map((membership) => membership.studentId)
            }

            const weekdayMemberships =
                schoolYearId != null && studentIds.length > 0
                    ? await prisma.studentWeekdayGroup.findMany({
                        where: {
                            studentId: { in: studentIds },
                            schoolYearId,
                            weekday: weekdayNum
                        },
                        select: {
                            studentId: true,
                            groupId: true
                        }
                    })
                    : []

            const groupByStudentId = new Map<number, number>()
            for (const membership of weekdayMemberships) {
                groupByStudentId.set(membership.studentId, membership.groupId)
            }

            const classStudents =
                studentIds.length > 0
                    ? await prisma.student.findMany({
                        where: { id: { in: studentIds }, isActive: true },
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true
                        },
                        orderBy: [
                            { lastName: 'asc' },
                            { firstName: 'asc' }
                        ]
                    })
                    : []

            students.push(classStudents.map((student) => ({
                ...student,
                classId,
                groupId: groupByStudentId.get(student.id) ?? null
            })))
        }

        // Filter assignments to only include those with valid schedules for this weekday
        const allClassAssignments = await prisma.teacherAssignment.findMany({
            where: {
                classId: { in: [...validClassIds] },
                ...(schoolYearId != null ? { schoolYearId } : {}),
                selectedWeekday: weekdayNum
            },
            include: {
                teacher: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                },
                room: {
                    select: {
                        name: true
                    }
                }
            }
        })

        const filteredOwnAssignments = ownAssignments
            .filter(assignment => validClassIds.has(assignment.classId))
            .map(assignment => ({
                id: assignment.id,
                teacherId: assignment.teacherId,
                classId: assignment.classId,
                period: assignment.period,
                groupId: assignment.groupId,
                pmTrack: assignment.pmTrack
            }))

        const filteredAssignments = allClassAssignments
            .filter(assignment => validClassIds.has(assignment.classId))
            .map(assignment => ({
                id: assignment.id,
                teacherId: assignment.teacherId,
                classId: assignment.classId,
                period: assignment.period,
                groupId: assignment.groupId,
                teacherFirstName: assignment.teacher?.firstName ?? null,
                teacherLastName: assignment.teacher?.lastName ?? null,
                roomName: assignment.room?.name ?? null,
                pmTrack: assignment.pmTrack
            }))

        // If no valid schedules found for this weekday, return empty data structure
        if (validClassIds.size === 0) {
            return ok({
                schedules: [],
                students: [],
                teacherRotation: [],
                assignments: [],
                classAssignments: [],
                classdata: []
            })
        }
        
        return ok({
            schedules,
            students,
            teacherRotation,
            assignments: filteredOwnAssignments,
            classAssignments: filteredAssignments,
            classdata: classdata
        })
    } catch (error) {
        captureError(error, {
            location: 'api/schedules/data',
            type: 'schedule_data_error',
            extra: {
                teacherUsername: searchParams.get('teacher'),
                weekday: searchParams.get('weekday')
            }
        })
        return serverError('Internal server error')
    }
}