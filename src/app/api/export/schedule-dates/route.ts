import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { pdf } from '@react-pdf/renderer'
import ScheduleTurnusPDF, { type ScheduleData } from '@/components/ScheduleTurnusPDF'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'

import { prisma } from '@/lib/prisma'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * Handles POST requests to generate and return a PDF schedule for a specified class and weekday.
 *
 * Extracts `className` and `selectedWeekday` from the request URL, validates them, and queries the database for the relevant class and schedule. If found, generates a PDF document containing the schedule and returns it as a downloadable file. Returns appropriate HTTP error responses if validation fails or data is not found.
 *
 * @returns A PDF file response containing the schedule, or a JSON error response with an appropriate HTTP status code.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

    try {
        const { searchParams } = new URL(request.url)
        const className = searchParams.get('className')
        const selectedWeekday = searchParams.get('selectedWeekday')

        if (!selectedWeekday) {
            return NextResponse.json({ error: 'Selected Weekday is required' }, { status: 400 })
        }

        const weekday = Number(selectedWeekday)
        if (isNaN(weekday) || weekday < 1 || weekday > 5) {
            return NextResponse.json({ error: 'Selected Weekday is invalid' }, { status: 400 })
        }

        if (!className) {
            return NextResponse.json({ error: 'Class Name is required' }, { status: 400 })
        }

        const schoolYearIdParam = searchParams.get('schoolYearId')
        let schoolYearId: number | null = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : null
        if (schoolYearId == null || Number.isNaN(schoolYearId)) {
            const now = new Date()
            const current = await prisma.schoolYear.findFirst({
                where: { startDate: { lte: now }, endDate: { gte: now } },
                select: { id: true }
            })
            schoolYearId = current?.id ?? (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))?.id ?? null
        }
        if (schoolYearId == null) {
            return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
        }

        const class_response = await prisma.class.findUnique({
            where: { name: className }
        })

        if (!class_response) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 })
        }

        const schedule = await prisma.schedule.findFirst({
            where: {
                classId: class_response.id,
                selectedWeekday: weekday,
                schoolYearId
            },
            orderBy: [{ createdAt: 'desc' }],
            include: {
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

        if (!schedule) {
            return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
        }

        const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const weekdayString = days[weekday];
        
        // Use normalized turns if available, otherwise fall back to scheduleData
        let scheduleData: ScheduleData = {};
        if (schedule.turns && schedule.turns.length > 0) {
            scheduleData = normalizeToJsonFormat(schedule.turns) as ScheduleData;
        } else if (schedule.scheduleData && typeof schedule.scheduleData === 'object' && !Array.isArray(schedule.scheduleData)) {
            scheduleData = schedule.scheduleData as unknown as ScheduleData;
        }
        const doc = ScheduleTurnusPDF({ scheduleData: scheduleData as unknown as ScheduleData, className: className ?? '', weekdayString: weekdayString ?? '' })
        const pdfBuffer = await pdf(doc).toBuffer()
        return new NextResponse(pdfBuffer as unknown as BodyInit, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=schedule-dates-${className}.pdf`
            }
        })
    } catch (error) {
        captureError(error, {
            location: 'api/export',
            type: 'export-schedule'
        })
        return NextResponse.json({ error: 'Failed to generate pdf file' }, { status: 500 })
    }
}

