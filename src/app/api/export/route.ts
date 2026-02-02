import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { generateSchedulePDF } from '@/lib/pdf-generator'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'

/**
 * Handles HTTP POST requests to generate and return a PDF schedule for a specified class.
 *
 * Extracts the class name from the request URL, retrieves class, student, group, teacher assignment, and schedule data from the database, and generates a PDF schedule document. Returns the PDF as a downloadable file, or a JSON error response with an appropriate HTTP status code if the class is not found, required data is missing, or an error occurs during processing.
 *
 * @returns A PDF file as a response if successful, or a JSON error response with status 400 or 500 if an error occurs.
 */
export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const className = searchParams.get('className')
       
        if (!className) {
            const error = new Error('Class Name is required')
            captureError(error, {
                location: 'api/export',
                type: 'export-schedule'
            })
            return NextResponse.json({ error: 'Class Name is required' }, { status: 400 })
        }

        // Get class
        const class_response = await prisma.class.findUnique({
            where: { name: className },
            include: {
                classHead: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                },
                classLead: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                }
            }
        })
        if (!class_response) {
            const error = new Error('Class not found')
            captureError(error, {
                location: 'api/export',
                type: 'pdf-data-error'
            })
            return NextResponse.json({ error: 'Class not found' }, { status: 400 })
        }

        // Get students with groupId
        const students = await prisma.student.findMany({
            where: {
                classId: class_response.id,
                groupId: { not: null }
            },
            orderBy: [{ groupId: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }]
        })

        // Get all groups for this class
        const groupIds = Array.from(new Set(students.map(s => s.groupId))).filter((id) => id !== null) as number[];
        const groups = groupIds.map((groupId: number) => ({
            id: groupId,
            students: students.filter(s => s.groupId === groupId)
        }));
        // Get teacher assignments (AM/PM) with relations (no weekday filter - each class has one schedule)
        const teacherAssignments = await prisma.teacherAssignment.findMany({
            where: { classId: class_response.id },
            orderBy: [{ period: 'asc' }, { groupId: 'asc' }],
            include: {
                teacher: true,
                room: true,
                subject: true,
                learningContent: true,
            }
        })
        
        // Get the schedule
        const schedule = await prisma.schedule.findFirst({
            where: { classId: class_response.id },
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
    
        // Use normalized turns if available, otherwise fall back to scheduleData
        let turns: Record<string, unknown> = {};
        if (schedule?.turns && schedule.turns.length > 0) {
            turns = normalizeToJsonFormat(schedule.turns) as Record<string, unknown>;
        } else if (schedule && typeof schedule.scheduleData === 'object' && schedule.scheduleData !== null && !Array.isArray(schedule.scheduleData)) {
            turns = schedule.scheduleData as Record<string, unknown>;
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
            classHead: class_response.classHead ? `${class_response.classHead.firstName} ${class_response.classHead.lastName}` : '—',
            classLead: class_response.classLead ? `${class_response.classLead.firstName} ${class_response.classLead.lastName}` : '—',
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
        return NextResponse.json(
            { error: 'Failed to generate PDF' },
            { status: 500 }
        )
    }
}