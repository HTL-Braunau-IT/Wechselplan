import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'

/**
 * The current teacher's personal Noten view preferences. One row per teacher
 * (NotenViewPreference), not scoped by class or year — a preference like "open
 * the Sitzplan view by default" follows the teacher everywhere.
 */

/**
 * GET: the teacher's view preferences.
 * Returns: { seatingModeDefault } — the default (false) when nothing is saved,
 * or for staff without a Teacher row (an admin who does not teach).
 */
export async function GET() {
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

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) return NextResponse.json({ seatingModeDefault: false })

    const pref = await prisma.notenViewPreference.findUnique({
      where: { teacherId: teacher.id },
      select: { seatingModeDefault: true },
    })

    return NextResponse.json({ seatingModeDefault: pref?.seatingModeDefault ?? false })
  } catch (error) {
    captureError(error, { location: 'api/noten/view-preference', type: 'get-view-preference' })
    return NextResponse.json({ error: 'Failed to load view preference' }, { status: 500 })
  }
}

/**
 * PATCH: save the teacher's view preferences.
 * Body: { seatingModeDefault: boolean }
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

    const body = (await request.json()) as { seatingModeDefault?: unknown }
    if (typeof body.seatingModeDefault !== 'boolean') {
      return NextResponse.json({ error: 'seatingModeDefault (boolean) required' }, { status: 400 })
    }
    const seatingModeDefault = body.seatingModeDefault

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    await prisma.notenViewPreference.upsert({
      where: { teacherId: teacher.id },
      create: { teacherId: teacher.id, seatingModeDefault },
      update: { seatingModeDefault },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    captureError(error, { location: 'api/noten/view-preference', type: 'save-view-preference' })
    return NextResponse.json({ error: 'Failed to save view preference' }, { status: 500 })
  }
}
