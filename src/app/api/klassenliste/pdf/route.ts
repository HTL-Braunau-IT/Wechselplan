import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAccess } from '@/lib/api-guard'
import { resolveSchoolYearId } from '@/lib/school-year'
import { formatDateGerman } from '@/lib/pdf-helpers'
import { buildKlassenlisteView, getClassRoster, isWritingSpace } from '@/lib/klassenliste'
import { generateKlassenlistePDF } from '@/lib/pdf-generator'

/**
 * Renders a class's Klassenliste as an A4-portrait PDF for the chosen groups and
 * writing-space layout. Staff-only (returns full rosters); the fonts this route
 * reads off disk are declared in `next.config.js` (outputFileTracingIncludes).
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

    const spaceParam = searchParams.get('space')
    const space = isWritingSpace(spaceParam) ? spaceParam : 'split'

    // `groups` is a comma list of section ids to include; absent = every group.
    const groupsParam = searchParams.get('groups')
    const groupsFilter = groupsParam
      ? groupsParam
          .split(',')
          .map(part => parseInt(part.trim(), 10))
          .filter(n => Number.isInteger(n))
      : undefined

    const roster = await getClassRoster(classId, schoolYearId)
    if (!roster) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const built = buildKlassenlisteView(roster.students, groupsFilter)

    const pdfBuffer = await generateKlassenlistePDF({
      className: roster.className,
      schoolYearLabel: roster.schoolYearLabel,
      classHead: roster.classHead,
      classLead: roster.classLead,
      space,
      hasPlan: built.hasPlan,
      sections: built.sections,
      plain: built.plain,
      total: built.total,
      createdAt: formatDateGerman(new Date()),
    })

    const today = new Date().toLocaleDateString('de-DE')
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Klassenliste-${roster.className}-${today}.pdf"`,
      },
    })
  } catch (error) {
    captureError(error, { location: 'api/klassenliste/pdf', type: 'export-klassenliste' })
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
