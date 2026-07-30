import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { getSubjectKey } from '@/lib/subject-utils'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'

/**
 * Handles GET requests to retrieve class data with students and unique teachers.
 *
 * Returns class information, all students in the class (with groupId), and unique teachers
 * assigned to the class via TeacherAssignment (both AM and PM periods).
 *
 * @returns A JSON response containing class info, students array, and teachers array.
 */
export async function GET(
  request: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const id = context?.params?.id
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const classId = parseInt(id)

    if (isNaN(classId)) {
      return NextResponse.json({ error: 'Invalid class ID' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const schoolYearIdParam = searchParams.get('schoolYearId')
    const schoolYearId = await resolveSchoolYearId(schoolYearIdParam)
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    // Fetch class with class lead (students loaded by year below)
    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        classLead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // Students for this class and school year via ClassMembership
    const memberships = await prisma.classMembership.findMany({
      where: { classId, schoolYearId },
      select: { studentId: true },
      orderBy: { studentId: 'asc' },
    })
    const studentIds = memberships.map(m => m.studentId)
    const studentsList =
      studentIds.length > 0
        ? await prisma.student.findMany({
            where: { id: { in: studentIds } },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
            select: { id: true, firstName: true, lastName: true, groupId: true },
          })
        : []

    // Fetch all teacher assignments for this class and year
    const assignments = await prisma.teacherAssignment.findMany({
      where: { classId, schoolYearId },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Get unique teachers grouped by period (AM/PM)
    const amTeachersMap = new Map<number, { id: number; firstName: string; lastName: string }>()
    const pmTeachersMap = new Map<number, { id: number; firstName: string; lastName: string }>()

    for (const assignment of assignments) {
      const teacherData = {
        id: assignment.teacher.id,
        firstName: assignment.teacher.firstName,
        lastName: assignment.teacher.lastName,
      }

      if (assignment.period === 'AM' && !amTeachersMap.has(assignment.teacherId)) {
        amTeachersMap.set(assignment.teacherId, teacherData)
      } else if (assignment.period === 'PM' && !pmTeachersMap.has(assignment.teacherId)) {
        pmTeachersMap.set(assignment.teacherId, teacherData)
      }
    }

    // Sort teachers by last name, then first name
    const sortTeachers = (teachers: Array<{ id: number; firstName: string; lastName: string }>) => {
      return teachers.sort((a, b) => {
        const lastNameCompare = a.lastName.localeCompare(b.lastName)
        if (lastNameCompare !== 0) return lastNameCompare
        return a.firstName.localeCompare(b.firstName)
      })
    }

    const amTeachers = sortTeachers(Array.from(amTeachersMap.values()))
    const pmTeachers = sortTeachers(Array.from(pmTeachersMap.values()))

    // Helper: most common subject name from a subset of assignments
    const mostCommonSubjectFrom = (list: typeof assignments): string | undefined => {
      const subjectCounts = new Map<string, number>()
      for (const a of list) {
        if (a.subject?.name) {
          subjectCounts.set(a.subject.name, (subjectCounts.get(a.subject.name) ?? 0) + 1)
        }
      }
      let maxCount = 0
      let name: string | undefined = undefined
      for (const [subject, count] of subjectCounts.entries()) {
        if (count > maxCount) {
          maxCount = count
          name = subject
        }
      }
      return name
    }

    const amAssignments = assignments.filter(a => a.period === 'AM')
    const pmAssignments = assignments.filter(a => a.period === 'PM')
    const subjectNameAm =
      amAssignments.length > 0 ? mostCommonSubjectFrom(amAssignments) : undefined
    const subjectNamePm =
      pmAssignments.length > 0 ? mostCommonSubjectFrom(pmAssignments) : undefined
    const hasSeparateAmPmSubjects =
      subjectNameAm != null &&
      subjectNamePm != null &&
      getSubjectKey(subjectNameAm) !== getSubjectKey(subjectNamePm)

    // Single subject for display when not split (most common across all)
    let subjectName: string | undefined = undefined
    if (assignments.length > 0) {
      subjectName = mostCommonSubjectFrom(assignments)
    }

    // Fetch transfer status for this class and year
    const transfers = await prisma.notenmanagementTransfer.findMany({
      where: { classId, schoolYearId },
      select: { semester: true, lfId: true },
    })

    const transferStatus = {
      first: {
        transferred: transfers.some(t => t.semester === 'first'),
        lfId: transfers.find(t => t.semester === 'first')?.lfId ?? null,
      },
      second: {
        transferred: transfers.some(t => t.semester === 'second'),
        lfId: transfers.find(t => t.semester === 'second')?.lfId ?? null,
      },
    }

    return NextResponse.json({
      id: classRecord.id,
      name: classRecord.name,
      description: classRecord.description,
      subjectName,
      hasSeparateAmPmSubjects,
      ...(hasSeparateAmPmSubjects && { subjectNameAm, subjectNamePm }),
      classLead: classRecord.classLead
        ? `${classRecord.classLead.firstName} ${classRecord.classLead.lastName}`
        : null,
      classLeadId: classRecord.classLead?.id ?? null,
      students: studentsList,
      amTeachers,
      pmTeachers,
      transferStatus,
    })
  } catch (error) {
    captureError(error, {
      location: 'api/notensammler/class/[id]',
      type: 'fetch-class-data',
    })
    return NextResponse.json({ error: 'Failed to fetch class data' }, { status: 500 })
  }
}
