import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import {
  GradingCriteriaError,
  listTeacherCriteria,
  saveTeacherCriteria,
} from '@/lib/grading-criteria'
import { gradingCriteriaInputSchema } from '@/types/grading-criteria'

/**
 * GET /api/grading-criteria — the signed-in teacher's Beurteilungskriterien
 * templates plus the classes they teach this school year (the override picker).
 *
 * Query params: `schoolYearId` (optional, defaults to the current year).
 */
export async function GET(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const teacher = await resolveSessionTeacher(gate.session)
    if (!teacher) {
      return NextResponse.json({ error: 'Kein Lehrerprofil gefunden' }, { status: 403 })
    }
    const { searchParams } = new URL(request.url)
    const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
    return NextResponse.json(await listTeacherCriteria(teacher, schoolYearId))
  } catch (error) {
    captureError(error, { location: 'api/grading-criteria', type: 'list' })
    return NextResponse.json({ error: 'Kriterien konnten nicht geladen werden' }, { status: 500 })
  }
}

/** POST /api/grading-criteria — create a template for the signed-in teacher. */
export async function POST(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const teacher = await resolveSessionTeacher(gate.session)
    if (!teacher) {
      return NextResponse.json({ error: 'Kein Lehrerprofil gefunden' }, { status: 403 })
    }
    const parsed = gradingCriteriaInputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 })
    }
    const id = await saveTeacherCriteria(teacher.id, null, parsed.data)
    return NextResponse.json({ id }, { status: 201 })
  } catch (error) {
    if (error instanceof GradingCriteriaError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    captureError(error, { location: 'api/grading-criteria', type: 'create' })
    return NextResponse.json(
      { error: 'Kriterien konnten nicht gespeichert werden' },
      { status: 500 },
    )
  }
}
