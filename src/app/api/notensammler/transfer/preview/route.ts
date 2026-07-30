import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { denyUnlessAccess } from '@/lib/api-guard'
import { deriveSubjectForClass, nmNoteFromEndnote } from '@/lib/notenmanagement/grade-mapping'

type Semester = 'first' | 'second'

/**
 * Builds the transfer preview for the Notensammler Endnote flow.
 *
 * Fully local: the Matrikelnummer is already cached on each student (link sync),
 * and the grade to send is the reviewed FinalGrade (Endnote). No Notenmanagement
 * login is needed to preview — credentials are only required for the actual
 * write. This is the single source of truth for what will be transferred; the
 * teacher can override individual notes in the dialog before sending.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  let requestData: unknown
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const body = (await request.json()) as { classId?: unknown; semester?: unknown; schoolYearId?: unknown }
    requestData = body

    const classId = typeof body.classId === 'number' ? body.classId : parseInt(String(body.classId), 10)
    const semester: Semester | null =
      body.semester === 'first' || body.semester === 'second' ? body.semester : null
    if (!classId || Number.isNaN(classId) || !semester) {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
    }

    let schoolYearId =
      typeof body.schoolYearId === 'number' ? body.schoolYearId : parseInt(String(body.schoolYearId), 10)
    if (!schoolYearId || Number.isNaN(schoolYearId)) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true },
      })
      const resolved =
        current?.id ??
        (await prisma.schoolYear.findFirst({ orderBy: { startDate: 'desc' }, select: { id: true } }))
          ?.id
      if (!resolved) {
        return NextResponse.json(
          { error: 'No school year found. Create a school year in Admin / Data / School Years first.' },
          { status: 400 },
        )
      }
      schoolYearId = resolved
    }

    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { isActive: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            groupId: true,
            matrikelnummer: true,
            nmKlasse: true,
          },
        },
      },
    })
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const assignments = await prisma.teacherAssignment.findMany({
      where: { classId },
      include: { subject: { select: { name: true } } },
    })
    const subject = deriveSubjectForClass(assignments)

    const finals = await prisma.finalGrade.findMany({
      where: { classId, semester, schoolYearId },
      select: { studentId: true, grade: true },
    })
    const finalGradeByStudent = new Map<number, number | null>()
    for (const f of finals) finalGradeByStudent.set(f.studentId, f.grade)

    const scoped = classRecord.students.filter(st => st.groupId !== null && st.groupId !== undefined)

    const students = scoped.map(st => {
      const endnote = finalGradeByStudent.get(st.id) ?? null
      const mapped = nmNoteFromEndnote(endnote)
      return {
        studentId: st.id,
        firstName: st.firstName,
        lastName: st.lastName,
        endnote,
        note: mapped.note,
        nullNoteLabel: mapped.nullNoteLabel,
        hasEndnote: endnote != null,
        linked: Boolean(st.matrikelnummer),
        matrikelnummer: st.matrikelnummer ?? null,
        nmKlasse: st.nmKlasse ?? null,
      }
    })

    const unlinkedStudents = students.filter(s => !s.linked).map(s => `${s.lastName} ${s.firstName}`)
    const withoutEndnote = students.filter(s => s.linked && !s.hasEndnote).map(s => `${s.lastName} ${s.firstName}`)

    const transfers = await prisma.notenmanagementTransfer.findMany({
      where: { classId },
      select: { semester: true, lfId: true },
    })
    const transferStatus = {
      first: {
        transferred: transfers.some(t => t.semester === 'first'),
        lfId: transfers.find(t => t.semester === 'first')?.lfId ?? null,
      },
      second: {
        transferred: transfers.some(t => t.semester === 'second'),
        lfId: transfers.find(t => t.semester === 'second')?.lfId ?? null,
      },
    }

    return NextResponse.json({
      classId,
      className: classRecord.name,
      subjectName: subject?.subjectName ?? null,
      subjectTruncated: subject?.subjectTruncated ?? null,
      semester,
      schoolYearId,
      students,
      counts: {
        totalScoped: scoped.length,
        linked: students.filter(s => s.linked).length,
        unlinked: unlinkedStudents.length,
        withEndnote: students.filter(s => s.hasEndnote).length,
        withoutEndnote: withoutEndnote.length,
        readyToSend: students.filter(s => s.linked && s.hasEndnote).length,
      },
      unlinkedStudents,
      withoutEndnoteStudents: withoutEndnote,
      transferStatus,
    })
  } catch (error) {
    captureError(error, {
      location: 'api/notensammler/transfer/preview',
      type: 'preview',
      extra: { requestData },
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build preview' },
      { status: 500 },
    )
  }
}
