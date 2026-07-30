import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'

/**
 * GET: Returns students in the given class (and optionally group). If groupId is omitted, returns all students in the class (all groups).
 * Only if current teacher is assigned to that class.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isFeatureEnabled('noten'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const classIdParam = searchParams.get('classId')
    const groupIdParam = searchParams.get('groupId')
    const schoolYearIdParam = searchParams.get('schoolYearId')

    if (!classIdParam) {
      return NextResponse.json({ error: 'classId required' }, { status: 400 })
    }
    const classId = parseInt(classIdParam, 10)
    const groupId = groupIdParam !== null && groupIdParam !== '' ? parseInt(groupIdParam, 10) : null
    if (Number.isNaN(classId) || (groupId !== null && Number.isNaN(groupId))) {
      return NextResponse.json({ error: 'Invalid classId or groupId' }, { status: 400 })
    }

    const schoolYearId = await resolveSchoolYearId(schoolYearIdParam)
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    const isAssignedToClass = await prisma.teacherAssignment.findFirst({
      where: { teacherId: teacher.id, classId, schoolYearId },
    })
    if (!isAssignedToClass) {
      return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
    }

    const membershipIds = await prisma.classMembership.findMany({
      where: { classId, schoolYearId },
      select: { studentId: true },
    })
    const studentIds = membershipIds.map(m => m.studentId)
    if (studentIds.length === 0) {
      return NextResponse.json({ students: [] })
    }

    // Grade entry student picker: only show active students. Historical grades
    // still look up by studentId directly (no filter), so past records stay visible.
    const students = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        isActive: true,
        ...(groupId !== null ? { groupId } : {}),
      },
      select: { id: true, firstName: true, lastName: true, groupId: true, sitzplatz: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    return NextResponse.json({ students })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/students',
      type: 'fetch-students',
    })
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }
}
