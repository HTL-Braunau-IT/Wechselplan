import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess, requireAccess } from '@/lib/api-guard'
import { resolveCurrentTeacher } from '@/lib/current-teacher'
import { resolveSchoolYearId } from '@/lib/school-year'
import { bestEffort } from '@/lib/notifications'
import { resolveMemberClassIds } from '@/lib/combined-classes'
import { notifyScheduleChange } from '../_notify'

/** A weekday query/body value (0–6), or null when absent/invalid. */
function parseWeekday(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null
}

interface Assignment {
  groupId: number
  studentIds: number[]
}

interface RequestBody {
  classId: number
  assignments: Assignment[]
  removedStudentIds?: number[]
  /** The weekday plan being edited. Groups are per weekday; see StudentWeekdayGroup. */
  weekday?: number
  schoolYearId?: number
}

/**
 * Retrieves group assignments and unassigned students for a specified class.
 *
 * Returns a JSON response containing an array of group assignments and a list of students without a group assignment for the given class.
 *
 * @param request - The HTTP request containing the `classId` query parameter.
 * @returns A JSON response with `assignments` (group assignments) and `unassignedStudents` (students not assigned to any group).
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const classIdParam = searchParams.get('classId')

    if (!classIdParam) {
      captureError(new Error('Class ID parameter is required'), {
        location: 'api/schedules/assignments',
        type: 'validation-error',
        extra: {
          searchParams: Object.fromEntries(new URL(request.url).searchParams),
        },
      })
      return NextResponse.json({ error: 'Class ID parameter is required' }, { status: 400 })
    }

    const classId = parseInt(classIdParam, 10)
    if (isNaN(classId)) {
      captureError(new Error('Class ID must be a number'), {
        location: 'api/schedules/assignments',
        type: 'validation-error',
        extra: {
          searchParams: Object.fromEntries(new URL(request.url).searchParams),
        },
      })
      return NextResponse.json({ error: 'Class ID must be a number' }, { status: 400 })
    }

    // Find the class by ID
    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
    })

    if (!classRecord) {
      captureError(new Error('Class not found'), {
        location: 'api/schedules/assignments',
        type: 'not-found',
        extra: {
          classId,
          searchParams: Object.fromEntries(new URL(request.url).searchParams),
        },
      })
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // A combined class has no students of its own — its roster is the union of
    // its member classes. GroupAssignment (the group cache) still lives under the
    // combined class's own name, and Student.groupId carries the group per student.
    const rosterClassIds = await resolveMemberClassIds(classRecord.id)

    // Get all students with their group assignments for this class
    const students = await prisma.student.findMany({
      where: {
        classId: { in: rosterClassIds },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    // Per-weekday grouping: each day's plan has its own groups.
    const weekday = parseWeekday(searchParams.get('weekday'))
    if (weekday != null) {
      const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
      if (schoolYearId == null) {
        return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
      }
      const rows = await prisma.studentWeekdayGroup.findMany({
        where: { classId: classRecord.id, schoolYearId },
        select: { studentId: true, groupId: true, selectedWeekday: true },
        orderBy: { selectedWeekday: 'asc' },
      })
      // This day's rows; a day not grouped yet starts from the earliest other
      // day's grouping, and a class never grouped per day from Student.groupId.
      const seedDay = rows.some(r => r.selectedWeekday === weekday)
        ? weekday
        : rows[0]?.selectedWeekday
      const dayGroups =
        seedDay != null
          ? new Map(
              rows.filter(r => r.selectedWeekday === seedDay).map(r => [r.studentId, r.groupId]),
            )
          : new Map(students.flatMap(s => (s.groupId != null ? [[s.id, s.groupId] as const] : [])))

      const byGroup = new Map<number, number[]>()
      for (const student of students) {
        const groupId = dayGroups.get(student.id)
        if (groupId == null) continue
        const list = byGroup.get(groupId) ?? []
        list.push(student.id)
        byGroup.set(groupId, list)
      }
      const dayAssignments: Assignment[] = [...byGroup.keys()]
        .sort((a, b) => a - b)
        .map(groupId => ({ groupId, studentIds: byGroup.get(groupId) ?? [] }))

      return NextResponse.json({
        assignments: dayAssignments,
        unassignedStudents: students
          .filter(s => !dayGroups.has(s.id))
          .map(s => ({ ...s, groupId: null })),
        weekday,
        seededFromWeekday: seedDay != null && seedDay !== weekday ? seedDay : null,
      })
    }

    // Group students by their groupId
    const groups = new Map<number, typeof students>()
    students.forEach(student => {
      if (student.groupId) {
        if (!groups.has(student.groupId as number)) {
          groups.set(student.groupId as number, [])
        }
        groups.get(student.groupId as number)!.push(student)
      }
    })

    // Get all group assignments for this class (including empty groups)
    const groupAssignments = await prisma.groupAssignment.findMany({
      where: { class: classRecord.name },
      orderBy: { groupId: 'asc' },
    })

    // Get all group IDs that students actually have (even if not in GroupAssignment table)
    const studentGroupIds = Array.from(groups.keys())

    // Ensure GroupAssignment records exist for all groups that students are in
    // This fixes cases where GroupAssignment records are missing
    for (const groupId of studentGroupIds) {
      const existingGroupAssignment = groupAssignments.find(ga => ga.groupId === groupId)
      if (!existingGroupAssignment) {
        // Create missing GroupAssignment record
        await prisma.groupAssignment.upsert({
          where: {
            class_groupId: {
              class: classRecord.name,
              groupId: groupId,
            },
          },
          update: {},
          create: {
            groupId: groupId,
            class: classRecord.name,
          },
        })
      }
    }

    // Get updated group assignments (including newly created ones)
    const allGroupAssignments = await prisma.groupAssignment.findMany({
      where: { class: classRecord.name },
      orderBy: { groupId: 'asc' },
    })

    // Convert to the expected format, including empty groups
    const assignments: Assignment[] = allGroupAssignments.map(groupAssignment => ({
      groupId: groupAssignment.groupId,
      studentIds: groups.get(groupAssignment.groupId)?.map((s: { id: number }) => s.id) ?? [],
    }))

    return NextResponse.json({
      assignments,
      unassignedStudents: students.filter(s => !s.groupId),
    })
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/assignments',
      type: 'fetch-assignments',
      extra: {
        searchParams: Object.fromEntries(new URL(request.url).searchParams),
      },
    })
    return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
  }
}

/**
 * Handles POST requests to update student group assignments for a given class.
 *
 * Expects a JSON payload with the class ID, an array of group assignments, and optionally an array of student IDs to unassign. Validates the input, updates each student's group assignment in the database, and unassigns students as specified. Returns a JSON response indicating success or an error message with the appropriate HTTP status code.
 *
 * @returns A JSON response indicating success, or an error message with HTTP status 400, 404, or 500.
 */
export async function POST(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  let rawBody = ''
  try {
    // Capture raw body once so it can be reused in error reporting
    rawBody = await request.text()
    let body: RequestBody
    try {
      body = JSON.parse(rawBody)
    } catch {
      captureError(new Error('Invalid request body'), {
        location: 'api/schedules/assignments',
        type: 'validation-error',
        extra: { requestBody: rawBody },
      })
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { classId, assignments, removedStudentIds } = body
    const weekday = parseWeekday(body.weekday)

    if (!classId || typeof classId !== 'number') {
      captureError(new Error('Class ID parameter is required'), {
        location: 'api/schedules/assignments',
        type: 'validation-error',
        extra: { requestBody: rawBody },
      })
      return NextResponse.json({ error: 'Class ID parameter is required' }, { status: 400 })
    }

    if (!Array.isArray(assignments)) {
      captureError(new Error('Assignments must be an array'), {
        location: 'api/schedules/assignments',
        type: 'validation-error',
        extra: { requestBody: rawBody },
      })
      return NextResponse.json({ error: 'Assignments must be an array' }, { status: 400 })
    }

    // Validate each assignment
    for (const assignment of assignments) {
      if (!assignment.studentIds) {
        captureError(new Error('Each assignment must have studentIds'), {
          location: 'api/schedules/assignments',
          type: 'validation-error',
          extra: { requestBody: rawBody },
        })
        return NextResponse.json({ error: 'Each assignment must have studentIds' }, { status: 400 })
      }

      if (typeof assignment.groupId !== 'number') {
        captureError(new Error('groupId must be a number'), {
          location: 'api/schedules/assignments',
          type: 'validation-error',
          extra: { requestBody: rawBody },
        })
        return NextResponse.json({ error: 'groupId must be a number' }, { status: 400 })
      }
    }

    // Find the class by ID
    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
    })

    if (!classRecord) {
      captureError(new Error('Class not found'), {
        location: 'api/schedules/assignments',
        type: 'not-found',
        extra: {
          classId,
          requestBody: rawBody,
        },
      })
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // A combined class writes group membership onto students who live in its
    // member classes; scope every student write to that set so the class-scoped
    // guard below still holds for combined and normal classes alike.
    const rosterClassIds = await resolveMemberClassIds(classRecord.id)

    if (weekday != null) {
      const schoolYearId = await resolveSchoolYearId(body.schoolYearId)
      if (schoolYearId == null) {
        return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
      }

      // Only students on this class's roster may be grouped into its plan.
      const roster = await prisma.student.findMany({
        where: { classId: { in: rosterClassIds } },
        select: { id: true },
      })
      const rosterIds = new Set(roster.map(s => s.id))
      const rows = assignments
        .filter(a => a.groupId !== 0)
        .flatMap(a =>
          a.studentIds
            .filter(id => rosterIds.has(id))
            .map(studentId => ({
              studentId,
              classId: classRecord.id,
              schoolYearId,
              selectedWeekday: weekday,
              groupId: a.groupId,
            })),
        )

      // Replace this day's grouping wholesale. Other weekdays, and the class-wide
      // Student.groupId, are deliberately left alone: editing one day's groups
      // must never regroup the class on another day.
      await prisma.$transaction([
        prisma.studentWeekdayGroup.deleteMany({
          where: { classId: classRecord.id, schoolYearId, selectedWeekday: weekday },
        }),
        prisma.studentWeekdayGroup.createMany({ data: rows, skipDuplicates: true }),
      ])

      await bestEffort('notify:schedule-assignments', async () => {
        const session = gate.session
        await notifyScheduleChange({
          type: 'schedule-students-changed',
          classId,
          schoolYearId,
          actor: await resolveCurrentTeacher(session),
          session,
        })
      })

      return NextResponse.json({ success: true })
    }

    // Legacy class-wide path (no weekday): kept for callers outside the wizard.
    // First, ensure all groups exist in GroupAssignment table
    const requestedGroupIds = assignments.map(a => a.groupId).filter(id => id !== 0) // Exclude unassigned group

    // GroupAssignment (denormalized cache) and Student.groupId (source of truth)
    // must move together. Run the whole re-shuffle in one transaction so a
    // mid-sequence failure rolls back rather than leaving the cache and the
    // student rows in disagreement with no way to repair (finding 21).
    await prisma.$transaction(async tx => {
      // Create or update GroupAssignment records for all requested groups
      for (const groupId of requestedGroupIds) {
        await tx.groupAssignment.upsert({
          where: {
            class_groupId: {
              class: classRecord.name,
              groupId: groupId,
            },
          },
          update: {},
          create: {
            groupId: groupId,
            class: classRecord.name,
          },
        })
      }

      // Remove orphan GroupAssignment rows for this class (e.g. empty group 3 after reducing to 2 groups)
      if (requestedGroupIds.length > 0) {
        await tx.groupAssignment.deleteMany({
          where: {
            class: classRecord.name,
            groupId: { notIn: requestedGroupIds },
          },
        })
      } else {
        await tx.groupAssignment.deleteMany({
          where: { class: classRecord.name },
        })
      }

      // Update each student's groupId. Scope by classId so a stray id can never
      // pull a student from another class into this class's group numbering.
      for (const assignment of assignments) {
        await tx.student.updateMany({
          where: {
            id: { in: assignment.studentIds },
            classId: { in: rosterClassIds },
          },
          // groupId 0 is the "unassigned" sentinel → clear the group.
          data: { groupId: assignment.groupId === 0 ? null : assignment.groupId },
        })
      }

      // Remove groupId from removed students (this is now handled by the unassigned group)
      if (Array.isArray(removedStudentIds) && removedStudentIds.length > 0) {
        await tx.student.updateMany({
          where: {
            id: { in: removedStudentIds },
            classId: { in: rosterClassIds },
          },
          data: {
            groupId: null,
          },
        })
      }
    })

    // A group re-shuffle is a schedule change everyone attached to the class
    // cares about (issue #96). Folded into the class's bell entry, so re-saving
    // the group grid does not stack notifications. The whole block is
    // best-effort, context lookups included: the group writes have committed, so
    // a failing lookup must not surface as a 500.
    await bestEffort('notify:schedule-assignments', async () => {
      const session = gate.session
      const actor = await resolveCurrentTeacher(session)
      const schoolYearId = await resolveSchoolYearId()
      if (schoolYearId != null) {
        await notifyScheduleChange({
          type: 'schedule-students-changed',
          classId,
          schoolYearId,
          actor,
          session,
        })
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/assignments',
      type: 'create-assignments',
      extra: { requestBody: rawBody },
    })
    return NextResponse.json({ error: 'Failed to create assignments' }, { status: 500 })
  }
}
