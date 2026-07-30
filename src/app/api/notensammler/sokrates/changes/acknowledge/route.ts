import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { denyUnlessAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { isFeatureEnabled } from '@/lib/entitlements'
import { actorName } from '@/lib/current-teacher'
import { bestEffort, clearSokratesChangeNotifications } from '@/lib/notifications'
import {
  acknowledgeSokratesChangeNotices,
  canManageSokrates,
  type SokratesChangeScope,
} from '@/lib/sokrates-lock'
import type { Semester } from '@/lib/grades'
import { parseId, parseSemester, resolveCurrentTeacher, resolveSchoolYearId } from '../../_shared'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * POST /api/notensammler/sokrates/changes/acknowledge
 * Body: { classId, schoolYearId?, semester? }
 *
 * The class lead's "Gesehen" action on the rundown panel: marks the class's open
 * change notices as acknowledged (clearing the grid's drift markers), dismisses
 * the lead's own `sokrates-change` bell entry, and notifies each subject teacher
 * that the lead has seen their change (issue #96). When `semester` is omitted,
 * both semesters are acknowledged.
 *
 * Only the class lead may acknowledge — the same authority that manages the
 * Sokrates mark. Admins are not silently granted it here (no override flag).
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const body = (await request.json()) as {
      classId?: unknown
      schoolYearId?: unknown
      semester?: unknown
    }
    const classId = parseId(body.classId)
    if (classId == null) {
      return NextResponse.json({ error: 'classId is required' }, { status: 400 })
    }
    const schoolYearId = await resolveSchoolYearId(body.schoolYearId)
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }
    // Absent semester means "both"; an explicit but invalid one is rejected.
    const semester = body.semester == null ? null : parseSemester(body.semester)
    if (body.semester != null && semester == null) {
      return NextResponse.json({ error: 'Invalid semester' }, { status: 400 })
    }

    const teacher = await resolveCurrentTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }

    const canAcknowledge = await canManageSokrates({
      classId,
      role: session?.user?.role,
      teacherId: teacher.id,
    })
    if (!canAcknowledge) {
      return NextResponse.json({ error: 'Only the class lead may acknowledge' }, { status: 403 })
    }

    const semesters: Semester[] = semester ? [semester] : ['first', 'second']
    const scopes: SokratesChangeScope[] = semesters.map(s => ({
      classId,
      schoolYearId,
      semester: s,
    }))

    const now = new Date()
    const count = await acknowledgeSokratesChangeNotices({
      scopes,
      recipientId: teacher.id,
      acknowledgedByName: actorName(teacher, session),
      now,
    })

    // Clear the lead's own bell entry for these scopes too, so acknowledging from
    // the page and from the bell leave the same state. Best-effort: the
    // acknowledgement above has already committed, so a failure here must not
    // report a 500 for an action the caller can see took effect.
    await bestEffort('acknowledge:sokrates-bell', async () => {
      for (const s of semesters) {
        await clearSokratesChangeNotifications({ classId, schoolYearId, semester: s, readAt: now })
      }
    })

    return NextResponse.json({ success: true, count })
  } catch (error) {
    captureError(error as Error, {
      location: 'api/notensammler/sokrates/changes/acknowledge',
      type: 'acknowledge-changes',
    })
    return NextResponse.json({ error: 'Failed to acknowledge changes' }, { status: 500 })
  }
}
