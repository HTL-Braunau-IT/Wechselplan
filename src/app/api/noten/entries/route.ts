import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
const ALLOWED_ATTENDANCE = ['Anwesend', 'Krank', 'Entschuldigt', 'Unentschuldigt']

type EntryPayload = {
  studentId: number
  date: string
  period: string
  attendance?: string | null
  wiederholung1?: number | null
  wiederholung2?: number | null
  bericht1?: number | null
  bericht2?: number | null
  mitarbeit1?: number | null
  mitarbeit2?: number | null
  praktischeArbeit1?: number | null
  praktischeArbeit2?: number | null
  notizen?: string | null
}

/**
 * PATCH/POST: Batch upsert NotenEntry rows. Body: { classId, groupId, schoolYearId, entries: EntryPayload[] }
 */
export async function PATCH(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!(await isFeatureEnabled('noten'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const body = await request.json()
    const { classId, groupId, schoolYearId, entries } = body as {
      classId?: number
      groupId?: number
      schoolYearId?: number
      entries?: EntryPayload[]
    }

    if (classId == null || groupId == null || schoolYearId == null || !Array.isArray(entries)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const username = normalizeUsername(session.user.name)
    const teacher = await prisma.teacher.findUnique({ where: { username } })
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    const isAssignedToClass = await prisma.teacherAssignment.findFirst({
      where: { teacherId: teacher.id, classId, schoolYearId },
    })
    if (!isAssignedToClass) {
      return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
    }

    for (const e of entries) {
      if (e.studentId == null || !e.date || !e.period) continue
      if (e.period !== 'AM' && e.period !== 'PM') continue
      const dateOnly = new Date(e.date + 'T00:00:00.000Z')
      if (Number.isNaN(dateOnly.getTime())) continue
      const attendance =
        e.attendance != null && ALLOWED_ATTENDANCE.includes(e.attendance) ? e.attendance : null
      const clampGrade = (v: unknown): number | null => {
        if (v == null) return null
        const n = Number(v)
        return ALLOWED_GRADES.includes(n) ? n : null
      }
      await prisma.notenEntry.upsert({
        where: {
          studentId_teacherId_classId_groupId_schoolYearId_date_period: {
            studentId: e.studentId,
            teacherId: teacher.id,
            classId,
            groupId,
            schoolYearId,
            date: dateOnly,
            period: e.period,
          },
        },
        create: {
          studentId: e.studentId,
          teacherId: teacher.id,
          classId,
          groupId,
          schoolYearId,
          date: dateOnly,
          period: e.period,
          attendance,
          wiederholung1: clampGrade(e.wiederholung1),
          wiederholung2: clampGrade(e.wiederholung2),
          bericht1: clampGrade(e.bericht1),
          bericht2: clampGrade(e.bericht2),
          mitarbeit1: clampGrade(e.mitarbeit1),
          mitarbeit2: clampGrade(e.mitarbeit2),
          praktischeArbeit1: clampGrade(e.praktischeArbeit1),
          praktischeArbeit2: clampGrade(e.praktischeArbeit2),
          notizen: e.notizen != null ? String(e.notizen) : null,
        },
        update: {
          attendance,
          wiederholung1: clampGrade(e.wiederholung1),
          wiederholung2: clampGrade(e.wiederholung2),
          bericht1: clampGrade(e.bericht1),
          bericht2: clampGrade(e.bericht2),
          mitarbeit1: clampGrade(e.mitarbeit1),
          mitarbeit2: clampGrade(e.mitarbeit2),
          praktischeArbeit1: clampGrade(e.praktischeArbeit1),
          praktischeArbeit2: clampGrade(e.praktischeArbeit2),
          notizen: e.notizen != null ? String(e.notizen) : null,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/entries',
      type: 'save-entries',
    })
    return NextResponse.json({ error: 'Failed to save entries' }, { status: 500 })
  }
}

export { PATCH as POST }
