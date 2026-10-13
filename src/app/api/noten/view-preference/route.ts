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

const DEFAULTS = { seatingModeDefault: false, tableSecondMark: true }

/**
 * GET: the teacher's view preferences.
 * Returns: { seatingModeDefault, tableSecondMark } — the defaults (false, true)
 * when nothing is saved, or for staff without a Teacher row (an admin who does
 * not teach).
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
    if (!teacher) return NextResponse.json(DEFAULTS)

    const pref = await prisma.notenViewPreference.findUnique({
      where: { teacherId: teacher.id },
      select: { seatingModeDefault: true, tableSecondMark: true },
    })

    return NextResponse.json(pref ?? DEFAULTS)
  } catch (error) {
    captureError(error, { location: 'api/noten/view-preference', type: 'get-view-preference' })
    return NextResponse.json({ error: 'Failed to load view preference' }, { status: 500 })
  }
}

/**
 * PATCH: save the teacher's view preferences. Either field may be sent alone;
 * what is left out keeps its saved value.
 * Body: { seatingModeDefault?: boolean, tableSecondMark?: boolean }
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
      seatingModeDefault?: unknown
      tableSecondMark?: unknown
    }
    const patch: { seatingModeDefault?: boolean; tableSecondMark?: boolean } = {}
    for (const key of ['seatingModeDefault', 'tableSecondMark'] as const) {
      const value = body[key]
      if (value === undefined) continue
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: `${key} must be a boolean` }, { status: 400 })
      }
      patch[key] = value
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: 'seatingModeDefault or tableSecondMark (boolean) required' },
        { status: 400 },
      )
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    await prisma.notenViewPreference.upsert({
      where: { teacherId: teacher.id },
      create: { teacherId: teacher.id, ...patch },
      update: patch,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    captureError(error, { location: 'api/noten/view-preference', type: 'save-view-preference' })
    return NextResponse.json({ error: 'Failed to save view preference' }, { status: 500 })
  }
}
