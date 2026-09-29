import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { requireAccess } from '@/lib/api-guard'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { newShareToken } from '@/lib/grading-criteria'

type Params = { params: Promise<{ id: string }> }

/**
 * Sets a template's share token: a fresh token (POST) or none (DELETE). Scoped
 * to the signed-in teacher's own templates; anything else is a 404.
 */
async function setShareToken(
  session: Parameters<typeof resolveSessionTeacher>[0],
  params: Params['params'],
  token: string | null,
): Promise<Response> {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }
  const teacher = await resolveSessionTeacher(session)
  if (!teacher) {
    return NextResponse.json({ error: 'Kein Lehrerprofil gefunden' }, { status: 403 })
  }
  const { count } = await prisma.gradingCriteria.updateMany({
    where: { id, teacherId: teacher.id },
    data: { shareToken: token },
  })
  if (count === 0) {
    return NextResponse.json({ error: 'Kriterien nicht gefunden' }, { status: 404 })
  }
  return NextResponse.json({ shareToken: token })
}

/**
 * POST /api/grading-criteria/[id]/share — create the template's view-only link,
 * or replace it: a new token invalidates the old link.
 */
export async function POST(_request: Request, { params }: Params) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    return await setShareToken(gate.session, params, newShareToken())
  } catch (error) {
    captureError(error, { location: 'api/grading-criteria/[id]/share', type: 'create' })
    return NextResponse.json({ error: 'Link konnte nicht erstellt werden' }, { status: 500 })
  }
}

/** DELETE /api/grading-criteria/[id]/share — revoke the view-only link. */
export async function DELETE(_request: Request, { params }: Params) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    return await setShareToken(gate.session, params, null)
  } catch (error) {
    captureError(error, { location: 'api/grading-criteria/[id]/share', type: 'revoke' })
    return NextResponse.json({ error: 'Link konnte nicht deaktiviert werden' }, { status: 500 })
  }
}
