import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { requireAccess } from '@/lib/api-guard'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { GradingCriteriaError, saveTeacherCriteria } from '@/lib/grading-criteria'
import { gradingCriteriaInputSchema } from '@/types/grading-criteria'

type Params = { params: Promise<{ id: string }> }

const parseId = async (params: Params['params']) => {
  const id = Number((await params).id)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * PUT /api/grading-criteria/[id] — replace one of the signed-in teacher's
 * templates (title, content, default flag and the exact set of class overrides).
 */
export async function PUT(request: Request, { params }: Params) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const id = await parseId(params)
    if (id == null) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
    const teacher = await resolveSessionTeacher(gate.session)
    if (!teacher) {
      return NextResponse.json({ error: 'Kein Lehrerprofil gefunden' }, { status: 403 })
    }
    const parsed = gradingCriteriaInputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
    }
    await saveTeacherCriteria(teacher.id, id, parsed.data)
    return NextResponse.json({ id })
  } catch (error) {
    if (error instanceof GradingCriteriaError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    captureError(error, { location: 'api/grading-criteria/[id]', type: 'update' })
    return NextResponse.json(
      { error: 'Kriterien konnten nicht gespeichert werden' },
      { status: 500 },
    )
  }
}

/** DELETE /api/grading-criteria/[id] — delete a template; its class overrides and share link go with it. */
export async function DELETE(_request: Request, { params }: Params) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const id = await parseId(params)
    if (id == null) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
    const teacher = await resolveSessionTeacher(gate.session)
    if (!teacher) {
      return NextResponse.json({ error: 'Kein Lehrerprofil gefunden' }, { status: 403 })
    }
    const { count } = await prisma.gradingCriteria.deleteMany({
      where: { id, teacherId: teacher.id },
    })
    if (count === 0) {
      return NextResponse.json({ error: 'Kriterien nicht gefunden' }, { status: 404 })
    }
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    captureError(error, { location: 'api/grading-criteria/[id]', type: 'delete' })
    return NextResponse.json({ error: 'Kriterien konnten nicht gelöscht werden' }, { status: 500 })
  }
}
