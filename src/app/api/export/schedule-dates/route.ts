import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { pdf } from '@react-pdf/renderer'
import ScheduleTurnusPDF, { type ScheduleData } from '@/components/ScheduleTurnusPDF'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'
import { applyPmTracksToTurnScheduleRecord, isPmBiweeklyAnchor } from '@/lib/pm-biweekly-track'
import type { TurnSchedule } from '@/types/schedule'
import { badRequest, notFound, serverError } from '@/lib/api-response'

import { prisma } from '@/lib/prisma'

/**
 * Handles POST requests to generate and return a PDF schedule for a specified class and weekday.
 *
 * Extracts `className` and `selectedWeekday` from the request URL, validates them, and queries the database for the relevant class and schedule. If found, generates a PDF document containing the schedule and returns it as a downloadable file. Returns appropriate HTTP error responses if validation fails or data is not found.
 *
 * @returns A PDF file response containing the schedule, or a JSON error response with an appropriate HTTP status code.
 */
export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const className = searchParams.get('className')
        const selectedWeekday = searchParams.get('selectedWeekday')

        if (!selectedWeekday) {
            return badRequest('Selected Weekday is required')
        }

        const weekday = Number(selectedWeekday)
        if (isNaN(weekday) || weekday < 1 || weekday > 5) {
            return badRequest('Selected Weekday is invalid')
        }

        if (!className) {
            return badRequest('Class Name is required')
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
            return badRequest('No school year found.')
        }

        const class_response = await prisma.class.findUnique({
            where: { name: className }
        })

        if (!class_response) {
            return notFound('Class not found')
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
            return notFound('Schedule not found')
        }

        const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const weekdayString = days[weekday];
        
        let scheduleData: ScheduleData = {};
        if (schedule.turns && schedule.turns.length > 0) {
            const normalized = normalizeToJsonFormat(schedule.turns) as TurnSchedule
            const anchor = isPmBiweeklyAnchor(schedule.pmBiweeklyAnchor) ? schedule.pmBiweeklyAnchor : null
            scheduleData = applyPmTracksToTurnScheduleRecord(normalized, anchor) as unknown as ScheduleData;
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
        return serverError('Failed to generate pdf file')
    }
}

