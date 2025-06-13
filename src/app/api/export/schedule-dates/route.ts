import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { pdf } from '@react-pdf/renderer'
import ScheduleTurnusPDF, { type ScheduleData } from '@/components/ScheduleTurnusPDF'


import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
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

        const class_response = await prisma.class.findUnique({
            where: { name: className }
        })

        if (!class_response) {
            return NextResponse.json({ error: 'Class not found' }, { status: 404 })
        }

        const schedule = await prisma.schedule.findFirst({
            where: { 
                classId: class_response.id,
                selectedWeekday: weekday
            },
            orderBy: [{ createdAt: 'desc' }],
            select: {
                scheduleData: true,
                additionalInfo: true
            }
        })

        if (!schedule) {
            return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
        }

        const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const weekdayString = days[weekday];
        
        const scheduleData =
            schedule.scheduleData && typeof schedule.scheduleData === 'object' && !Array.isArray(schedule.scheduleData)
                ? schedule.scheduleData
                : {};
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

