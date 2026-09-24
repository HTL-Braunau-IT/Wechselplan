import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { resolveMemberClassIds } from '@/lib/combined-classes'

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

    // The TeacherAssignment guard above stays on the selected class (the teacher
    // is assigned to the combined class, not its members). The roster, however,
    // lives in the member classes — expand to them. For a normal class this is
    // just [classId].
    const memberClassIds = await resolveMemberClassIds(classId)
    const membershipIds = await prisma.classMembership.findMany({
      where: { classId: { in: memberClassIds }, schoolYearId },
      select: { studentId: true },
    })
    const studentIds = membershipIds.map(m => m.studentId)
    if (studentIds.length === 0) {
      return NextResponse.json({ students: [] })
    }

    // Grade entry student picker: only show active students. Historical grades
    // still look up by studentId directly (no filter), so past records stay visible.
    const roster = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        isActive: true,
        ...(groupId !== null ? { groupId } : {}),
      },
      select: { id: true, firstName: true, lastName: true, groupId: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    // The seat number (Sitzplatz) is personal to the teacher and the school year,
    // so it comes from NotenSeatNumber rather than the shared Student row. Overlay
    // it onto each student under the same `sitzplatz` key the client already reads.
    const seatNumbers = await prisma.notenSeatNumber.findMany({
      where: { teacherId: teacher.id, schoolYearId, studentId: { in: roster.map(s => s.id) } },
      select: { studentId: true, seatNumber: true },
    })
    const seatByStudent = new Map(seatNumbers.map(s => [s.studentId, s.seatNumber]))
    const students = roster.map(s => ({ ...s, sitzplatz: seatByStudent.get(s.id) ?? null }))

    return NextResponse.json({ students })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/students',
      type: 'fetch-students',
    })
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }
}
