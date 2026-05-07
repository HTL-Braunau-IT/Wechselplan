import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { generateSchedulePDF } from '@/lib/pdf-generator'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'
import { badRequest, notFound, serverError } from '@/lib/api-response'

/**
 * Handles HTTP POST requests to generate and return a PDF schedule for a specified class.
 *
 * Extracts the class name from the request URL, retrieves class, student, group, teacher assignment, and schedule data from the database, and generates a PDF schedule document. Returns the PDF as a downloadable file, or a JSON error response with an appropriate HTTP status code if the class is not found, required data is missing, or an error occurs during processing.
 *
 * @returns A PDF file as a response if successful, or a JSON error response with status 400 or 500 if an error occurs.
 */
async function resolveSchoolYearId(param: string | null): Promise<number | null> {
    const parsed = param ? parseInt(param, 10) : undefined
    if (parsed != null && !Number.isNaN(parsed)) return parsed
    const now = new Date()
    const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true }
    })
    return current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id ?? null
}

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const className = searchParams.get('className')
        const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
        if (schoolYearId == null) {
            return badRequest('No school year found.')
        }

        if (!className) {
            const error = new Error('Class Name is required')
            captureError(error, {
                location: 'api/export',
                type: 'export-schedule'
            })
            return badRequest('Class Name is required')
        }

        // Get class (head/lead are now per-school-year via ClassYearStaff)
        const class_response = await prisma.class.findUnique({
            where: { name: className }
        })
        if (!class_response) {
            const error = new Error('Class not found')
            captureError(error, {
                location: 'api/export',
                type: 'pdf-data-error'
            })
            return notFound('Class not found')
        }

        const yearStaff = await prisma.classYearStaff.findUnique({
            where: { classId_schoolYearId: { classId: class_response.id, schoolYearId } },
            include: {
                classHead: { select: { firstName: true, lastName: true } },
                classLead: { select: { firstName: true, lastName: true } }
            }
        })

        // Get students with weekday group (default Monday) for this year (via ClassMembership)
        const membershipIds = await prisma.classMembership.findMany({
            where: { classId: class_response.id, schoolYearId },
            select: { studentId: true }
        })
        const studentIds = membershipIds.map((m) => m.studentId)
        const students =
            studentIds.length > 0
                ? await prisma.student.findMany({
                      where: { id: { in: studentIds } },
                      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
                  })
                : []
        const weekdayGroups =
            studentIds.length > 0
                ? await prisma.studentWeekdayGroup.findMany({
                    where: { studentId: { in: studentIds }, schoolYearId, weekday: 1 },
                    select: { studentId: true, groupId: true }
                })
                : []
        const groupByStudentId = new Map<number, number>()
        for (const row of weekdayGroups) {
            groupByStudentId.set(row.studentId, row.groupId)
        }
        const studentsWithGroup = students
            .map((student) => ({ ...student, groupId: groupByStudentId.get(student.id) ?? null }))
            .filter((student) => student.groupId != null)

        // Get all groups for this class
        const groupIds = Array.from(new Set(studentsWithGroup.map((s) => s.groupId))).filter((id) => id !== null) as number[];
        const groups = groupIds.map((groupId: number) => ({
            id: groupId,
            students: studentsWithGroup.filter((s) => s.groupId === groupId)
        }));
        // Get teacher assignments (AM/PM) for this year
        const teacherAssignments = await prisma.teacherAssignment.findMany({
            where: { classId: class_response.id, schoolYearId },
            orderBy: [{ period: 'asc' }, { groupId: 'asc' }],
            include: {
                teacher: true,
                room: true,
                subject: true,
                learningContent: true,
            }
        })
        
        // Get the schedule for this year
        const schedule = await prisma.schedule.findFirst({
            where: { classId: class_response.id, schoolYearId },
            orderBy: [{ createdAt: 'desc' }],
            include: {
                scheduleTimes: true,
                breakTimes: true,
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

        // Define the assignment type for mapping
        type Assignment = {
            id: number;
            classId: number;
            period: string;
            groupId: number;
            teacherId: number;
            subjectId: number;
            learningContentId: number;
            roomId: number;
            createdAt: Date;
            updatedAt: Date;
            teacher?: { firstName?: string; lastName?: string };
            subject?: { name?: string };
            learningContent?: { name?: string };
            room?: { name?: string };
            teacherFirstName?: string;
            teacherLastName?: string;
            subjectName?: string;
            learningContentName?: string;
            roomName?: string;
        };

        function mapAssignment(a: Assignment): {
            teacherFirstName: string;
            teacherLastName: string;
            subjectName: string;
            learningContentName: string;
            roomName: string;
            groupId: number;
        } {
            return {
                teacherFirstName: a.teacher?.firstName ?? '',
                teacherLastName: a.teacher?.lastName ?? '',
                subjectName: a.subject?.name ?? '',
                learningContentName: a.learningContent?.name ?? '',
                roomName: a.room?.name ?? '',
                groupId: a.groupId,
            };
        }

        const amAssignments = teacherAssignments
            .filter(a => a.period === 'AM')
            .map(mapAssignment);
        const pmAssignments = teacherAssignments
            .filter(a => a.period === 'PM')
            .map(mapAssignment); 
    
        let turns: Record<string, unknown> = {};
        if (schedule?.turns && schedule.turns.length > 0) {
            turns = normalizeToJsonFormat(schedule.turns) as Record<string, unknown>;
        }

        // Get schedule times and break times
        const scheduleTimes = schedule?.scheduleTimes ?? [];
        const breakTimes = schedule?.breakTimes ?? [];

        // Generate PDF using jsPDF
        const pdfBuffer = await generateSchedulePDF({
            groups,
            amAssignments,
            pmAssignments,
            turns,
            className: class_response.name,
            classHead: yearStaff?.classHead ? `${yearStaff.classHead.firstName} ${yearStaff.classHead.lastName}` : '—',
            classLead: yearStaff?.classLead ? `${yearStaff.classLead.firstName} ${yearStaff.classLead.lastName}` : '—',
            additionalInfo: schedule?.additionalInfo ?? '—',
            selectedWeekday: schedule?.selectedWeekday ?? 1,
            scheduleTimes,
            breakTimes,
            updatedAt: schedule?.updatedAt ?? new Date()
        })

        return new NextResponse(pdfBuffer as unknown as BodyInit, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=schedule-${className}.pdf`
            }
        })
    } catch (error) {
        captureError(error as Error, {
            location: 'api/export',
            type: 'export-schedule'
        })
        return serverError('Failed to generate PDF')
    }
}