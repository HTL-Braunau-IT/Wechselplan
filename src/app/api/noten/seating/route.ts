import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'

/** { [studentId]: { x, y } } in canvas pixels — a teacher's personal Sitzplan. */
type Positions = Record<string, { x: number; y: number }>

/**
 * Keep only well-formed entries: integer-ish student id keys mapping to finite
 * x/y. The layout is cosmetic, so a malformed key is dropped rather than 400'd,
 * but we never persist NaN/Infinity or non-numeric junk into the JSON column.
 */
function sanitizePositions(input: unknown): Positions {
  if (!input || typeof input !== 'object') return {}
  const out: Positions = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) continue
    if (!value || typeof value !== 'object') continue
    const { x, y } = value as { x?: unknown; y?: unknown }
    if (typeof x !== 'number' || typeof y !== 'number') continue
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out[key] = { x, y }
  }
  return out
}

function parseId(value: string | null): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * GET: the current teacher's seating layout for one class/group/year.
 * Query: classId, groupId, schoolYearId
 * Returns: { positions } — empty when nothing has been saved yet.
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
    const classId = parseId(searchParams.get('classId'))
    const groupId = parseId(searchParams.get('groupId'))
    const schoolYearId = parseId(searchParams.get('schoolYearId'))
    if (classId == null || groupId == null || schoolYearId == null) {
      return NextResponse.json({ error: 'classId, groupId, schoolYearId required' }, { status: 400 })
    }

    // The layout is per teacher; without a Teacher row there is nothing personal
    // to return (an admin who does not also teach has no Sitzplan).
    const teacher = await resolveSessionTeacher(session)
    if (!teacher) return NextResponse.json({ positions: {} })

    const layout = await prisma.notenSeatingLayout.findUnique({
      where: {
        teacherId_classId_groupId_schoolYearId: {
          teacherId: teacher.id,
          classId,
          groupId,
          schoolYearId,
        },
      },
      select: { positions: true },
    })

    return NextResponse.json({ positions: sanitizePositions(layout?.positions) })
  } catch (error) {
    captureError(error, { location: 'api/noten/seating', type: 'get-seating' })
    return NextResponse.json({ error: 'Failed to load seating layout' }, { status: 500 })
  }
}

/**
 * PATCH: save the current teacher's seating layout for one class/group/year.
 * Body: { classId, groupId, schoolYearId, positions }
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
      classId?: number
      groupId?: number
      schoolYearId?: number
      positions?: unknown
    }
    const classId = typeof body.classId === 'number' ? body.classId : null
    const groupId = typeof body.groupId === 'number' ? body.groupId : null
    const schoolYearId = typeof body.schoolYearId === 'number' ? body.schoolYearId : null
    if (classId == null || groupId == null || schoolYearId == null) {
      return NextResponse.json({ error: 'classId, groupId, schoolYearId required' }, { status: 400 })
    }

    const positions = sanitizePositions(body.positions)

    // A seating layout belongs to a teacher. Staff without a Teacher row (an
    // admin who does not teach) has no personal Sitzplan to write to.
    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    await prisma.notenSeatingLayout.upsert({
      where: {
        teacherId_classId_groupId_schoolYearId: {
          teacherId: teacher.id,
          classId,
          groupId,
          schoolYearId,
        },
      },
      create: { teacherId: teacher.id, classId, groupId, schoolYearId, positions },
      update: { positions },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    captureError(error, { location: 'api/noten/seating', type: 'save-seating' })
    return NextResponse.json({ error: 'Failed to save seating layout' }, { status: 500 })
  }
}
