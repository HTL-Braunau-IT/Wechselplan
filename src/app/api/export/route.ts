import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { generateSchedulePDF } from '@/lib/pdf-generator'
import { normalizeToJsonFormat } from '@/lib/schedule-data-helpers'
import { denyUnlessAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'

/**
 * Handles HTTP POST requests to generate and return a PDF schedule for a specified class.
 *
 * Extracts the class name from the request URL, retrieves class, student, group, teacher assignment, and schedule data from the database, and generates a PDF schedule document. Returns the PDF as a downloadable file, or a JSON error response with an appropriate HTTP status code if the class is not found, required data is missing, or an error occurs during processing.
 *
 * @returns A PDF file as a response if successful, or a JSON error response with status 400 or 500 if an error occurs.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const className = searchParams.get('className')
    const weekdayParam = searchParams.get('selectedWeekday')
    const requestedWeekday =
      weekdayParam != null && !Number.isNaN(Number(weekdayParam)) ? Number(weekdayParam) : null
    const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    if (!className) {
      const error = new Error('Class Name is required')
      captureError(error, {
        location: 'api/export',
        type: 'export-schedule',
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
            lastName: true,
          },
        },
        classLead: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    })
    if (!class_response) {
      const error = new Error('Class not found')
      captureError(error, {
        location: 'api/export',
        type: 'pdf-data-error',
      })
      return NextResponse.json({ error: 'Class not found' }, { status: 400 })
    }

    // Get students with groupId for this year (via ClassMembership)
    const membershipIds = await prisma.classMembership.findMany({
      where: { classId: class_response.id, schoolYearId },
      select: { studentId: true },
    })
    const studentIds = membershipIds.map(m => m.studentId)
    const students =
      studentIds.length > 0
        ? await prisma.student.findMany({
            where: { id: { in: studentIds }, groupId: { not: null } },
            orderBy: [{ groupId: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
          })
        : []

    // Build the group set from the DESIGNED groups (GroupAssignment), not just
    // the groups that currently hold an active student. The Wechselplan rotation
    // is a round-robin whose modulus is groups.length; if a group empties (its
    // last student is soft-deactivated) and we derived groups only from live
    // students, groups.length would shrink and every turnus column would print a
    // different teacher→group schedule than the one saved (finding 29).
    const designedGroups = await prisma.groupAssignment.findMany({
      where: { class: class_response.name },
      select: { groupId: true },
    })
    const groupIds = Array.from(
      new Set<number>([
        ...designedGroups.map(g => g.groupId),
        ...(students.map(s => s.groupId).filter(id => id !== null) as number[]),
      ]),
    ).sort((a, b) => a - b)
    const groups = groupIds.map((groupId: number) => ({
      id: groupId,
      students: students.filter(s => s.groupId === groupId),
    }))
    // Get the schedule for this year (a specific weekday if one was requested,
    // otherwise the most recent). Assignments are then scoped to ITS weekday so a
    // class with plans on several days does not spill every day's teachers into
    // one export.
    const schedule = await prisma.schedule.findFirst({
      where: {
        classId: class_response.id,
        schoolYearId,
        ...(requestedWeekday != null ? { selectedWeekday: requestedWeekday } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        scheduleTimes: true,
        breakTimes: true,
        turns: {
          include: {
            weeks: true,
            holidays: {
              include: {
                holiday: true,
              },
            },
          },
          orderBy: [{ period: 'asc' }, { order: 'asc' }],
        },
      },
    })

    if (!schedule) {
      // Parity with the excel / notenliste / schedule-dates exporters, which 404
      // rather than emit a near-empty PDF for a weekday with no plan.
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    const exportWeekday = requestedWeekday ?? schedule.selectedWeekday ?? 1

    // Get teacher assignments (AM/PM) for this year on the exported weekday
    const teacherAssignments = await prisma.teacherAssignment.findMany({
      where: { classId: class_response.id, schoolYearId, selectedWeekday: exportWeekday },
      orderBy: [{ period: 'asc' }, { groupId: 'asc' }],
      include: {
        teacher: true,
        room: true,
        subject: true,
        learningContent: true,
      },
    })

    // Define the assignment type for mapping
    type Assignment = {
      id: number
      classId: number
      period: string
      groupId: number
      teacherId: number
      subjectId: number
      learningContentId: number
      roomId: number
      createdAt: Date
      updatedAt: Date
      teacher?: { firstName?: string; lastName?: string }
      subject?: { name?: string }
      learningContent?: { name?: string }
      room?: { name?: string }
      teacherFirstName?: string
      teacherLastName?: string
      subjectName?: string
      learningContentName?: string
      roomName?: string
    }

    function mapAssignment(a: Assignment): {
      teacherFirstName: string
      teacherLastName: string
      subjectName: string
      learningContentName: string
      roomName: string
      groupId: number
    } {
      return {
        teacherFirstName: a.teacher?.firstName ?? '',
        teacherLastName: a.teacher?.lastName ?? '',
        subjectName: a.subject?.name ?? '',
        learningContentName: a.learningContent?.name ?? '',
        roomName: a.room?.name ?? '',
        groupId: a.groupId,
      }
    }

    const amAssignments = teacherAssignments.filter(a => a.period === 'AM').map(mapAssignment)
    const pmAssignments = teacherAssignments.filter(a => a.period === 'PM').map(mapAssignment)

    // Per-lane Turnusse: AM and PM each keep their own set (and their own count).
    const amTurns: Record<string, unknown> = schedule?.turns
      ? (normalizeToJsonFormat(schedule.turns.filter(turn => turn.period === 'AM')) as Record<
          string,
          unknown
        >)
      : {}
    const pmTurns: Record<string, unknown> = schedule?.turns
      ? (normalizeToJsonFormat(schedule.turns.filter(turn => turn.period === 'PM')) as Record<
          string,
          unknown
        >)
      : {}

    // Get schedule times and break times
    const scheduleTimes = schedule?.scheduleTimes ?? []
    const breakTimes = schedule?.breakTimes ?? []

    const pdfBuffer = await generateSchedulePDF({
      groups,
      amAssignments,
      pmAssignments,
      amTurns,
      pmTurns,
      amBiweekly: (schedule?.amWeekInterval ?? 1) > 1,
      pmBiweekly: (schedule?.pmWeekInterval ?? 1) > 1,
      className: class_response.name,
      classHead: class_response.classHead
        ? `${class_response.classHead.firstName} ${class_response.classHead.lastName}`
        : '—',
      classLead: class_response.classLead
        ? `${class_response.classLead.firstName} ${class_response.classLead.lastName}`
        : '—',
      additionalInfo: schedule?.additionalInfo ?? '—',
      selectedWeekday: schedule?.selectedWeekday ?? 1,
      scheduleTimes,
      breakTimes,
      updatedAt: schedule?.updatedAt ?? new Date(),
    })

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=schedule-${className}.pdf`,
      },
    })
  } catch (error) {
    captureError(error as Error, {
      location: 'api/export',
      type: 'export-schedule',
    })
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
