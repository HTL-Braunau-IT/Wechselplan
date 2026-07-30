import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { isFeatureEnabled } from '@/lib/entitlements'
import { prisma } from '@/lib/prisma'
import { getGradeDisplayText } from '@/lib/grades'
import { canManageSokrates } from '@/lib/sokrates-lock'
import { parseId, resolveCurrentTeacher, resolveSchoolYearId } from '../_shared'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const formatGrade = (grade: number | null): string =>
  grade === null ? '—' : getGradeDisplayText(grade)

/**
 * GET /api/notensammler/sokrates/changes?classId=&schoolYearId=
 *
 * The still-open, unacknowledged grade changes for a class after its Sokrates
 * mark — the "what changed" rundown the notification links to (issue #96), so
 * the reader does not have to hunt the drift markers across the grid.
 *
 * Scoped to the reader: the class lead (the notice recipient) sees every open
 * change in their class; a subject teacher sees the ones they made themselves.
 * `canAcknowledge` is true only for the class lead, who owns the "Gesehen"
 * action that closes the loop back to the teachers.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const classId = parseId(searchParams.get('classId'))
    if (classId == null) {
      return NextResponse.json({ error: 'classId is required' }, { status: 400 })
    }
    const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const teacher = await resolveCurrentTeacher(session)
    // An admin without a Teacher row has no personal stake in the notices.
    if (!teacher) {
      return NextResponse.json({ changes: [], canAcknowledge: false })
    }

    const canAcknowledge = await canManageSokrates({
      classId,
      role: session?.user?.role,
      teacherId: teacher.id,
    })

    const notices = await prisma.sokratesChangeNotice.findMany({
      where: {
        classId,
        schoolYearId,
        acknowledgedAt: null,
        // The lead sees every change in their class; a teacher sees their own.
        OR: [{ recipientId: teacher.id }, { changedById: teacher.id }],
      },
      orderBy: { changedAt: 'desc' },
      select: {
        id: true,
        studentName: true,
        subjectTeacherName: true,
        oldGrade: true,
        newGrade: true,
        semester: true,
        changedByName: true,
        changedAt: true,
      },
    })

    const changes = notices.map(notice => ({
      id: notice.id,
      studentName: notice.studentName,
      subjectTeacherName: notice.subjectTeacherName,
      oldGrade: formatGrade(notice.oldGrade),
      newGrade: formatGrade(notice.newGrade),
      semester: notice.semester,
      changedByName: notice.changedByName,
      changedAt: notice.changedAt.toISOString(),
    }))

    return NextResponse.json({ changes, canAcknowledge })
  } catch (error) {
    captureError(error as Error, {
      location: 'api/notensammler/sokrates/changes',
      type: 'list-changes',
    })
    return NextResponse.json({ error: 'Failed to load changes' }, { status: 500 })
  }
}
