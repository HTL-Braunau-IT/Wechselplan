import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { pdf } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import PDFLayout from '@/components/PDFLayout'

import { prisma } from '@/lib/prisma'

/**
 * Handles a POST request to generate and return a PDF schedule for a specified class.
 *
 * Extracts the `classId` from the request URL, retrieves class, student, group, teacher assignment, and schedule data from the database, and generates a PDF schedule document. Returns the PDF as a downloadable response, or a JSON error response with an appropriate HTTP status code if the class is not found or required data is missing.
 *
 * @returns A PDF file as a response if successful, or a JSON error response with an appropriate HTTP status code if an error occurs.
 */
export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const className = searchParams.get('classId')
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
            where: { name: className }
        })
        if (!class_response) {
            const error = new Error('Class not found')
            captureError(error, {
                location: 'api/schedules/pdf-data',
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
        // Find max students in any group
        const maxStudents = Math.max(...groups.map(g => g.students.length), 0)
        // Get teacher assignments (AM/PM) with relations
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

        function mapAssignment(a: Assignment): Assignment {
            return {
                ...a,
                teacherFirstName: a.teacher?.firstName ?? '',
                teacherLastName: a.teacher?.lastName ?? '',
                subjectName: a.subject?.name ?? '',
                learningContentName: a.learningContent?.name ?? '',
                roomName: a.room?.name ?? '',
            };
        }

        const amAssignments = teacherAssignments
            .filter(a => a.period === 'AM')
            .map(mapAssignment);
        const pmAssignments = teacherAssignments
            .filter(a => a.period === 'PM')
            .map(mapAssignment); 
    
        const schedule = await prisma.schedule.findFirst({
            where: { classId: class_response.id },
            orderBy: [{ createdAt: 'desc' }]
        })
        const turns = (schedule && typeof schedule.scheduleData === 'object' && schedule.scheduleData !== null && !Array.isArray(schedule.scheduleData))
  ? schedule.scheduleData
  : {};


        /**
         * @param {string} turnKey
         */
        function getTurnusInfo(turnKey: string) {
            if (!turns || typeof turns !== 'object') return { start: '', end: '', days: 0 };
            const entry = (turns as Record<string, unknown>)[turnKey];
            type TurnusEntry = { weeks: { date: string }[] };
            if (!entry || typeof entry !== 'object' || !Array.isArray((entry as TurnusEntry).weeks) || !(entry as TurnusEntry).weeks.length) return { start: '', end: '', days: 0 };
            const weeks = (entry as TurnusEntry).weeks;
            const start = weeks[0]?.date ?? ''
            const end = weeks[weeks.length - 1]?.date ?? ''
            const days = weeks.length
            return { start, end, days }
        }


        /**
         * @param {number} teacherIdx
         * @param {number} turnIdx
         * @param {'AM'|'PM'} period
         */
        function getGroupForTeacherAndTurn(teacherIdx: number, turnIdx: number, period: 'AM' | 'PM') {
            const groupList = groups
            const teacherList: Assignment[] = period === 'AM' ? amAssignments : pmAssignments
            if (!groupList[0] || !teacherList[teacherIdx]) return null
            // For each turn, rotate the group list
            const rotatedGroups = [...groupList]
            for (let i = 0; i < turnIdx; i++) {
                const temp = rotatedGroups.shift()
                if (temp !== undefined) rotatedGroups.push(temp)
            }
            const group = rotatedGroups[teacherIdx]
            return group
        }

        const doc = PDFLayout({
            groups,
            maxStudents,
            turns,
            getTurnusInfo,
            getGroupForTeacherAndTurn,
            amAssignments,
            pmAssignments,
            className: class_response.name
        }) as ReactElement<DocumentProps>
        const pdfBuffer = await pdf(doc).toBuffer()

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