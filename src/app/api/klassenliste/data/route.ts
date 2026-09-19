import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { buildKlassenlisteView, getClassRoster } from '@/lib/klassenliste'

/**
 * Roster for the Klassenliste preview: one class split into all its rotation
 * groups (plus a trailing ungrouped section), or one flat list when the class has
 * no plan. The client picks which groups and how much writing space to print, then
 * downloads the matching PDF from `/api/klassenliste/pdf`.
 *
 * Staff-only (full rosters with names). Defaults to the `staff` tier; the guard
 * enforces it in the handler too.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const { searchParams } = new URL(request.url)
    const classIdParam = searchParams.get('classId')
    if (!classIdParam) {
      return NextResponse.json({ error: 'classId parameter is required' }, { status: 400 })
    }
    const classId = parseInt(classIdParam, 10)
    if (Number.isNaN(classId)) {
      return NextResponse.json({ error: 'Invalid classId' }, { status: 400 })
    }

    const schoolYearId = await resolveSchoolYearId(searchParams.get('schoolYearId'))
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const roster = await getClassRoster(classId, schoolYearId)
    if (!roster) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const view = buildKlassenlisteView(roster.students)

    return NextResponse.json({
      className: roster.className,
      schoolYearLabel: roster.schoolYearLabel,
      classHead: roster.classHead,
      classLead: roster.classLead,
      hasPlan: view.hasPlan,
      sections: view.sections,
      plain: view.plain,
      total: view.total,
    })
  } catch (error) {
    captureError(error, { location: 'api/klassenliste/data', type: 'fetch-klassenliste' })
    return NextResponse.json({ error: 'Failed to load class list' }, { status: 500 })
  }
}
