import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * Handles HTTP GET requests to retrieve schedule, student, rotation, assignment, and class information for a specified teacher and weekday.
 *
 * Extracts the `teacher` (required) and `weekday` (optional, defaults to '0') query parameters from the request URL. Validates the teacher's existence, gathers their assignments, rotation data, class details (including class head and lead names), schedules for the given weekday, and students in each class. Returns a JSON response with the aggregated data or an error message in the response body.
 *
 * @returns A {@link NextResponse} containing a JSON object with arrays for schedules, students, teacher rotation, filtered assignments, and class information, or an error message.
 *
 * @remark All error conditions except internal server errors return HTTP 200 with an error message in the JSON payload. Only unexpected exceptions result in a 500 status code.
 */
export async function GET(req: Request) {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  try {
    const rawTeacherUsername = searchParams.get('teacher')
    const currentWeekday = searchParams.get('weekday') ?? '0'
    const schoolYearIdParam = searchParams.get('schoolYearId')

    if (!rawTeacherUsername) {
      return NextResponse.json({ error: 'Teacher username is required' }, { status: 400 })
    }
    const teacherUsername = normalizeUsername(rawTeacherUsername)
    if (!teacherUsername) {
      return NextResponse.json({ error: 'Teacher username is required' }, { status: 400 })
    }

    const teacher = await prisma.teacher.findUnique({
      where: {
        username: teacherUsername,
      },
    })

    if (!teacher) {
      console.warn('[username-match] Teacher not found (schedules/data)', {
        raw: rawTeacherUsername,
        normalized: teacherUsername,
      })
      return NextResponse.json({ error: 'Teacher not found' }, { status: 200 })
    }

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

    const ownAssignmentsWhere =
      schoolYearId != null ? { teacherId: teacher.id, schoolYearId } : { teacherId: teacher.id }
    const ownAssignments = await prisma.teacherAssignment.findMany({
      where: ownAssignmentsWhere,
    })

    if (!ownAssignments || ownAssignments.length === 0) {
      return NextResponse.json({ error: 'No classes assigned to teacher' }, { status: 200 })
    }

    const teacherRotation = await prisma.teacherRotation.findMany({
      where: {
        teacherId: teacher.id,
      },
    })

    if (!teacherRotation || teacherRotation.length === 0) {
      return NextResponse.json({ error: 'No teacher rotation found' }, { status: 200 })
    }

    const classIds = [...new Set(ownAssignments.map(assignment => assignment.classId))]
    const schedules = []
    const students = []
    const classdata: {
      id: number
      name: string
      classHead: string | null
      classLead: string | null
    }[] = []
    const validClassIds = new Set<number>()

    // First fetch all class data
    for (const classId of classIds) {
      const classInfo = await prisma.class.findUnique({
        where: {
          id: classId,
        },
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
      if (classInfo) {
        classdata.push({
          id: classInfo.id,
          name: classInfo.name,
          classHead: classInfo.classHead
            ? `${classInfo.classHead.firstName} ${classInfo.classHead.lastName}`
            : null,
          classLead: classInfo.classLead
            ? `${classInfo.classLead.firstName} ${classInfo.classLead.lastName}`
            : null,
        })
      }
    }

    // Then fetch schedules and students for each class
    const weekdayNum = parseInt(currentWeekday)
    for (const classId of classIds) {
      const schedule = await prisma.schedule.findFirst({
        where: {
          classId,
          selectedWeekday: weekdayNum,
          ...(schoolYearId != null ? { schoolYearId } : {}),
        },
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          breakTimes: true,
          scheduleTimes: true,
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true,
                },
              },
            },
            orderBy: {
              order: 'asc',
            },
          },
        },
      })

      // Add schedule if it exists for this weekday
      if (schedule) {
        schedules.push([schedule])
        validClassIds.add(classId)
      } else {
        // Add empty array to maintain index alignment with classIds
        schedules.push([])
      }

      // Fetch students for this class: by ClassMembership when schoolYearId set, else by Student.classId
      // Scheduling view only shows active students; historical grade queries remain unfiltered.
      let studentList: Awaited<ReturnType<typeof prisma.student.findMany>>
      if (schoolYearId != null) {
        const memberships = await prisma.classMembership.findMany({
          where: { classId, schoolYearId },
          select: { studentId: true },
        })
        const ids = memberships.map(m => m.studentId)
        studentList =
          ids.length > 0
            ? await prisma.student.findMany({ where: { id: { in: ids }, isActive: true } })
            : []
      } else {
        studentList = await prisma.student.findMany({
          where: { classId, isActive: true },
        })
      }
      if (studentList) {
        students.push(studentList)
      }
    }

    // Filter assignments to only include those with valid schedules for this weekday
    const allClassAssignments = await prisma.teacherAssignment.findMany({
      where: {
        classId: { in: [...validClassIds] },
        ...(schoolYearId != null ? { schoolYearId } : {}),
        selectedWeekday: weekdayNum,
      },
      include: {
        teacher: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        room: {
          select: {
            name: true,
          },
        },
      },
    })

    const filteredOwnAssignments = ownAssignments
      .filter(assignment => validClassIds.has(assignment.classId))
      .map(assignment => ({
        id: assignment.id,
        teacherId: assignment.teacherId,
        classId: assignment.classId,
        period: assignment.period,
        groupId: assignment.groupId,
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
      }))

    // If no valid schedules found for this weekday, return empty data structure
    if (validClassIds.size === 0) {
      return NextResponse.json(
        {
          schedules: [],
          students: [],
          teacherRotation: [],
          assignments: [],
          classdata: [],
        },
        { status: 200 },
      )
    }

    // Only return error if we have no students
    if (students.flat().length === 0) {
      return NextResponse.json({ error: 'No students found' }, { status: 200 })
    }

    return NextResponse.json(
      {
        schedules,
        students,
        teacherRotation,
        assignments: filteredOwnAssignments,
        classAssignments: filteredAssignments,
        classdata: classdata,
      },
      { status: 200 },
    )
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/data',
      type: 'schedule_data_error',
      extra: {
        teacherUsername: searchParams.get('teacher'),
        weekday: searchParams.get('weekday'),
      },
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
