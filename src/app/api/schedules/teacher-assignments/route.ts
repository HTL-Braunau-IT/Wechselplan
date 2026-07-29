import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * Handles GET requests to retrieve teacher assignments for a specified class, grouped by AM and PM periods.
 *
 * Extracts the `classId` and optional `selectedWeekday` query parameters from the request URL, fetches the corresponding class and its teacher assignments from the database, and returns the assignments separated into `amAssignments` and `pmAssignments` arrays, along with the `selectedWeekday` value. If `selectedWeekday` is provided, assignments are filtered by that weekday.
 *
 * @returns A JSON response containing `amAssignments`, `pmAssignments`, and `selectedWeekday`, or an error message with the appropriate HTTP status code if the class is not specified, not found, or an unexpected error occurs.
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const classIdParam = searchParams.get('classId')
    const selectedWeekdayParam = searchParams.get('selectedWeekday')
    const schoolYearIdParam = searchParams.get('schoolYearId')

    if (!classIdParam) {
      return NextResponse.json({ error: 'Class ID parameter is required' }, { status: 400 })
    }

    const classId = parseInt(classIdParam, 10)
    if (isNaN(classId)) {
      return NextResponse.json({ error: 'Class ID must be a number' }, { status: 400 })
    }

    // Find the class by ID
    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
    })

    if (!classRecord) {
      captureError(new Error('Class not found'), {
        location: 'api/schedules/teacher-assignments',
        type: 'fetch-assignments',
        extra: {
          searchParams: Object.fromEntries(new URL(request.url).searchParams),
        },
      })
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // Resolve school year: from query or current
    let schoolYearId: number | undefined = schoolYearIdParam
      ? parseInt(schoolYearIdParam, 10)
      : undefined
    if (schoolYearId == null || Number.isNaN(schoolYearId)) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true },
      })
      schoolYearId =
        current?.id ??
        (
          await prisma.schoolYear.findFirst({
            orderBy: { startDate: 'desc' },
            select: { id: true },
          })
        )?.id
    }
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    // Build where clause with optional weekday filter
    const whereClause: { classId: number; schoolYearId: number; selectedWeekday?: number } = {
      classId: classRecord.id,
      schoolYearId,
    }
    if (selectedWeekdayParam) {
      const weekday = parseInt(selectedWeekdayParam, 10)
      if (!isNaN(weekday)) {
        whereClause.selectedWeekday = weekday
      }
    }

    // Fetch existing assignments for this class and school year, optionally filtered by weekday
    const assignments = await prisma.teacherAssignment.findMany({
      where: whereClause,
      orderBy: [{ period: 'asc' }, { groupId: 'asc' }],
      include: {
        teacher: true,
        subject: true,
        learningContent: true,
        room: true,
      },
    })

    // Get the selected weekday from the first assignment or the parameter
    const selectedWeekday = selectedWeekdayParam
      ? parseInt(selectedWeekdayParam, 10)
      : (assignments[0]?.selectedWeekday ?? 1)

    // Group assignments by period
    const amAssignments = assignments
      .filter(a => a.period === 'AM')
      .map(a => ({
        groupId: a.groupId,
        teacherId: a.teacherId,
        teacherFirstName: a.teacher.firstName,
        teacherLastName: a.teacher.lastName,
        subject: a.subject.name,
        learningContent: a.learningContent.name,
        room: a.room.name,
      }))

    const pmAssignments = assignments
      .filter(a => a.period === 'PM')
      .map(a => ({
        groupId: a.groupId,
        teacherId: a.teacherId,
        teacherFirstName: a.teacher.firstName,
        teacherLastName: a.teacher.lastName,
        subject: a.subject.name,
        learningContent: a.learningContent.name,
        room: a.room.name,
      }))

    return NextResponse.json({
      amAssignments,
      pmAssignments,
      selectedWeekday,
    })
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/teacher-assignments',
      type: 'fetch-assignments',
      extra: {
        searchParams: Object.fromEntries(new URL(request.url).searchParams),
      },
    })
    return NextResponse.json({ error: 'Failed to fetch teacher assignments' }, { status: 500 })
  }
}

/**
 * Creates or updates teacher assignments for a specified class using data from the request body.
 *
 * Validates the existence of the class and related entities (subject, learning content, room), and either creates new assignments or replaces existing ones based on the `updateExisting` flag. Stores the `selectedWeekday` value with each assignment, defaulting to 1 if not provided.
 *
 * @returns A JSON response with `{ success: true }` on success, or an error message with the appropriate HTTP status code if validation fails or an error occurs.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  let requestData
  try {
    requestData = await request.json()
    const {
      classId,
      amAssignments,
      pmAssignments,
      updateExisting,
      selectedWeekday,
      schoolYearId: bodySchoolYearId,
    } = requestData

    if (!classId || typeof classId !== 'number') {
      captureError(new Error('Class ID parameter is required'), {
        location: 'api/schedules/teacher-assignments',
        type: 'fetch-assignments',
        extra: {
          searchParams: Object.fromEntries(new URL(request.url).searchParams),
        },
      })
      return NextResponse.json({ error: 'Class ID parameter is required' }, { status: 400 })
    }

    // Find the class by ID
    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
    })

    if (!classRecord) {
      captureError(new Error('Class not found'), {
        location: 'api/schedules/teacher-assignments',
        type: 'fetch-assignments',
        extra: {
          searchParams: Object.fromEntries(new URL(request.url).searchParams),
        },
      })
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // Resolve school year: from body or current
    let schoolYearId = typeof bodySchoolYearId === 'number' ? bodySchoolYearId : undefined
    if (schoolYearId == null) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true },
      })
      schoolYearId =
        current?.id ??
        (
          await prisma.schoolYear.findFirst({
            orderBy: { startDate: 'desc' },
            select: { id: true },
          })
        )?.id
    }
    if (schoolYearId == null) {
      return NextResponse.json(
        {
          error: 'No school year found. Create a school year in Admin / Data / School Years first.',
        },
        { status: 400 },
      )
    }

    // Check for existing assignments for this class and year
    const existingAssignments = await prisma.teacherAssignment.findMany({
      where: { classId: classRecord.id, schoolYearId },
    })

    if (existingAssignments.length > 0 && !updateExisting) {
      return NextResponse.json({ error: 'EXISTING_ASSIGNMENTS' }, { status: 409 })
    }

    // Delete existing assignments for this class and year if updating
    if (updateExisting) {
      await prisma.teacherAssignment.deleteMany({
        where: { classId: classRecord.id, schoolYearId },
      })
    }

    // Process AM assignments
    for (const assignment of amAssignments) {
      // Use upsert to create subject if it doesn't exist
      // If creating new, mark as custom (user-created)
      const subject = await prisma.subject.upsert({
        where: { name: assignment.subject },
        update: {},
        create: {
          name: assignment.subject,
          isCustom: true, // User-created values are custom
        },
      })

      // Use upsert to create learning content if it doesn't exist
      // If creating new, mark as custom (user-created)
      const learningContent = await prisma.learningContent.upsert({
        where: { name: assignment.learningContent },
        update: {},
        create: {
          name: assignment.learningContent,
          isCustom: true, // User-created values are custom
        },
      })

      // Use upsert to create room if it doesn't exist
      // If creating new, mark as custom (user-created)
      const room = await prisma.room.upsert({
        where: { name: assignment.room },
        update: {},
        create: {
          name: assignment.room,
          isCustom: true, // User-created values are custom
        },
      })

      await prisma.teacherAssignment.create({
        data: {
          classId: classRecord.id,
          schoolYearId,
          period: 'AM',
          groupId: assignment.groupId === 0 ? null : assignment.groupId,
          teacherId: assignment.teacherId,
          subjectId: subject.id,
          learningContentId: learningContent.id,
          roomId: room.id,
          selectedWeekday: selectedWeekday ?? 1,
        },
      })
    }

    // Process PM assignments
    for (const assignment of pmAssignments) {
      // Use upsert to create subject if it doesn't exist
      // If creating new, mark as custom (user-created)
      const subject = await prisma.subject.upsert({
        where: { name: assignment.subject },
        update: {},
        create: {
          name: assignment.subject,
          isCustom: true, // User-created values are custom
        },
      })

      // Use upsert to create learning content if it doesn't exist
      // If creating new, mark as custom (user-created)
      const learningContent = await prisma.learningContent.upsert({
        where: { name: assignment.learningContent },
        update: {},
        create: {
          name: assignment.learningContent,
          isCustom: true, // User-created values are custom
        },
      })

      // Use upsert to create room if it doesn't exist
      // If creating new, mark as custom (user-created)
      const room = await prisma.room.upsert({
        where: { name: assignment.room },
        update: {},
        create: {
          name: assignment.room,
          isCustom: true, // User-created values are custom
        },
      })

      await prisma.teacherAssignment.create({
        data: {
          classId: classRecord.id,
          schoolYearId,
          period: 'PM',
          groupId: assignment.groupId === 0 ? null : assignment.groupId,
          teacherId: assignment.teacherId,
          subjectId: subject.id,
          learningContentId: learningContent.id,
          roomId: room.id,
          selectedWeekday: selectedWeekday ?? 1,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/teacher-assignments',
      type: 'save-assignments',
      extra: {
        requestData,
      },
    })
    return NextResponse.json({ error: 'Failed to save teacher assignments' }, { status: 500 })
  }
}
