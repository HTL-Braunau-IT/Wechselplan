import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * PATCH: Update student sitzplatz
 * Body: { studentId: number, sitzplatz: string | null }
 */
export async function PATCH(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!(await isFeatureEnabled('noten'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const body = await request.json()
    const { studentId, sitzplatz } = body as {
      studentId?: number
      sitzplatz?: string | null
    }

    if (!studentId || typeof studentId !== 'number') {
      return NextResponse.json({ error: 'studentId required' }, { status: 400 })
    }

    // Verify the student exists
    const student = await prisma.student.findUnique({ where: { id: studentId } })
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // A teacher may only edit the seat of a student they currently teach —
    // i.e. a student in a class the teacher is assigned to in the active school
    // year. Admins may edit any student. Without this, any staff user could
    // overwrite any student's Sitzplatz by id. The teacher lookup lives inside
    // this branch so an admin without a Teacher row isn't wrongly rejected.
    if (session.user.role !== 'admin') {
      const teacher = await resolveSessionTeacher(session)
      if (!teacher) {
        return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
      }

      const currentYear = await prisma.schoolYear.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      })
      if (!currentYear) {
        return NextResponse.json({ error: 'No active school year' }, { status: 403 })
      }

      const memberships = await prisma.classMembership.findMany({
        where: { studentId, schoolYearId: currentYear.id },
        select: { classId: true },
      })
      const isAssigned =
        memberships.length > 0 &&
        (await prisma.teacherAssignment.findFirst({
          where: {
            teacherId: teacher.id,
            schoolYearId: currentYear.id,
            classId: { in: memberships.map(m => m.classId) },
          },
          select: { id: true },
        })) != null
      if (!isAssigned) {
        return NextResponse.json({ error: 'Not assigned to this student' }, { status: 403 })
      }
    }

    // Update the sitzplatz
    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { sitzplatz: sitzplatz ?? null },
      select: { id: true, firstName: true, lastName: true, groupId: true, sitzplatz: true },
    })

    return NextResponse.json({ student: updated })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/student-sitzplatz',
      type: 'update-sitzplatz',
    })
    return NextResponse.json({ error: 'Failed to update sitzplatz' }, { status: 500 })
  }
}
