import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'

/**
 * PATCH: Update the seat number a teacher has given a student.
 * Body: { studentId: number, sitzplatz: string | null, schoolYearId?: number }
 *
 * The seat number is personal to the teacher and scoped to the school year — it
 * lives in NotenSeatNumber, not on the shared Student row. An empty/null value
 * clears the teacher's row so it no longer shows up. Staff without a Teacher row
 * (an admin who does not teach) has no personal seat numbering to write to.
 */
export async function PATCH(request: Request) {
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

    const body = (await request.json()) as {
      studentId?: number
      sitzplatz?: string | null
      schoolYearId?: number
    }
    const { studentId, sitzplatz } = body

    if (!studentId || typeof studentId !== 'number') {
      return NextResponse.json({ error: 'studentId required' }, { status: 400 })
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    const schoolYearId = await resolveSchoolYearId(
      typeof body.schoolYearId === 'number' ? String(body.schoolYearId) : null,
    )
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No active school year' }, { status: 400 })
    }

    // Verify the student exists so a typo'd id doesn't silently create a row.
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    })
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    const value = typeof sitzplatz === 'string' ? sitzplatz.trim() : ''
    const key = {
      teacherId_studentId_schoolYearId: { teacherId: teacher.id, studentId, schoolYearId },
    }

    if (value === '') {
      // Clearing: drop the row rather than storing an empty string.
      await prisma.notenSeatNumber.deleteMany({
        where: { teacherId: teacher.id, studentId, schoolYearId },
      })
      return NextResponse.json({ ok: true, sitzplatz: null })
    }

    await prisma.notenSeatNumber.upsert({
      where: key,
      create: { teacherId: teacher.id, studentId, schoolYearId, seatNumber: value },
      update: { seatNumber: value },
    })

    return NextResponse.json({ ok: true, sitzplatz: value })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/student-sitzplatz',
      type: 'update-sitzplatz',
    })
    return NextResponse.json({ error: 'Failed to update sitzplatz' }, { status: 500 })
  }
}
