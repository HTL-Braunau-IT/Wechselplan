import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { ALLOWED_FINAL_GRADES } from '@/lib/grades'
import { resolveSchoolYearId } from '@/lib/school-year'
import {
  canManageSokrates,
  getSokratesStatus,
  isFinalGradeEditBlocked,
  resolveCurrentTeacher,
  withSokratesLock,
} from '@/lib/sokrates-lock'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const ALLOWED_CONDUCT_NOTE_WISH = [
  'Sehr zufriedenstellend',
  'Zufriedenstellend',
  'Wenig Zufriedenstellend',
  'Nicht zufriedenstellend',
] as const
const MAX_FINAL_GRADES_BATCH = 100

type FinalGradeEntry = {
  studentId: number
  semester: 'first' | 'second'
  grade: number | null
  conductNoteWish: string | null
}

/**
 * Handles POST requests to save or update multiple final grades in one transaction.
 * Body: { classId, schoolYearId?, finalGrades: Array<{ studentId, semester, grade?, conductNoteWish? }> }
 */
export async function POST(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  let requestData: unknown
  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const body = (await request.json()) as {
      classId: unknown
      schoolYearId?: number
      finalGrades: Array<{
        studentId: unknown
        semester: unknown
        grade?: unknown
        conductNoteWish?: string | null
      }>
      adminOverride?: unknown
    }
    requestData = body
    const { classId, schoolYearId: bodySchoolYearId, finalGrades: rawFinalGrades } = body

    if (!rawFinalGrades || !Array.isArray(rawFinalGrades)) {
      return NextResponse.json({ error: 'finalGrades must be an array' }, { status: 400 })
    }
    if (rawFinalGrades.length > MAX_FINAL_GRADES_BATCH) {
      return NextResponse.json(
        { error: `Too many final grades. Maximum ${MAX_FINAL_GRADES_BATCH} per request.` },
        { status: 400 },
      )
    }

    const classIdNum =
      typeof classId === 'string'
        ? parseInt(classId, 10)
        : typeof classId === 'number'
          ? classId
          : NaN
    if (isNaN(classIdNum)) {
      return NextResponse.json({ error: 'Invalid classId' }, { status: 400 })
    }

    // Resolve school year once
    const schoolYearId = await resolveSchoolYearId(bodySchoolYearId)
    if (schoolYearId == null) {
      return NextResponse.json(
        {
          error: 'No school year found. Create a school year in Admin / Data / School Years first.',
        },
        { status: 400 },
      )
    }

    // Verify class exists
    const classRecord = await prisma.class.findUnique({
      where: { id: classIdNum },
    })
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    // Parse and validate each entry
    const finalGrades: FinalGradeEntry[] = []
    for (let i = 0; i < rawFinalGrades.length; i++) {
      const fg = rawFinalGrades[i]!
      const studentId =
        typeof fg.studentId === 'string'
          ? parseInt(fg.studentId, 10)
          : typeof fg.studentId === 'number'
            ? fg.studentId
            : NaN
      if (isNaN(studentId)) {
        return NextResponse.json({ error: `Invalid studentId at index ${i}` }, { status: 400 })
      }
      if (fg.semester !== 'first' && fg.semester !== 'second') {
        return NextResponse.json(
          { error: `Semester must be "first" or "second" at index ${i}` },
          { status: 400 },
        )
      }
      let gradeValue: number | null = null
      if (fg.grade !== null && fg.grade !== undefined) {
        const num =
          typeof fg.grade === 'string'
            ? parseFloat(fg.grade)
            : typeof fg.grade === 'number'
              ? fg.grade
              : NaN
        if (isNaN(num) || !ALLOWED_FINAL_GRADES.includes(num)) {
          return NextResponse.json(
            {
              error: `Final grade must be one of: ${ALLOWED_FINAL_GRADES.join(', ')} or null at index ${i}`,
            },
            { status: 400 },
          )
        }
        gradeValue = num
      }
      let conductNoteWishValue: string | null = null
      if (
        fg.conductNoteWish !== undefined &&
        fg.conductNoteWish !== null &&
        fg.conductNoteWish !== ''
      ) {
        if (
          ALLOWED_CONDUCT_NOTE_WISH.includes(
            fg.conductNoteWish as (typeof ALLOWED_CONDUCT_NOTE_WISH)[number],
          )
        ) {
          conductNoteWishValue = fg.conductNoteWish
        } else {
          return NextResponse.json(
            {
              error: `conductNoteWish must be one of: ${ALLOWED_CONDUCT_NOTE_WISH.join(', ')} or null at index ${i}`,
            },
            { status: 400 },
          )
        }
      }
      finalGrades.push({
        studentId,
        semester: fg.semester as 'first' | 'second',
        grade: gradeValue,
        conductNoteWish: conductNoteWishValue,
      })
    }

    // Sokrates lock: a locked semester freezes the Zeugnisnote for everyone but
    // the class lead and admins. Locked entries are dropped from the write
    // rather than failing the whole "Alle speichern", which is what the grade
    // batch does — an untouched semester in the same request still saves.
    //
    // This route writes ONLY the FinalGrade (the class Endnote), exactly like the
    // single-cell route. It used to also mirror each Endnote into the caller's own
    // Grade column, which overwrote the caller's real subject marks and folded the
    // Endnote into every student's computed average — the grid's own invariant is
    // that "Endnote and Betragensnote belong to the class, not to a teacher
    // column" (finding 3). The mirror is gone so both save paths produce the same
    // DB state.
    //
    // The mark state is re-read and every write applied under the shared advisory
    // lock, so a mark committing mid-request cannot leave a hard-locked Zeugnisnote
    // written: whichever runs second sees the other's commit.
    const currentTeacher = await resolveCurrentTeacher(session)
    const canOverride = await canManageSokrates({
      classId: classIdNum,
      role: session.user?.role,
      teacherId: currentTeacher?.id ?? null,
      adminOverride: body.adminOverride === true,
    })

    const { count, skippedLocked } = await withSokratesLock(classIdNum, schoolYearId, async tx => {
      const sokratesStatus = await getSokratesStatus(classIdNum, schoolYearId, tx)
      let writable = finalGrades
      let skippedLocked = 0
      if (sokratesStatus.first.marked || sokratesStatus.second.marked) {
        writable = finalGrades.filter(
          fg => !isFinalGradeEditBlocked(sokratesStatus, fg.semester, canOverride),
        )
        skippedLocked = finalGrades.length - writable.length
      }

      for (const fg of writable) {
        await tx.finalGrade.upsert({
          where: {
            studentId_classId_semester_schoolYearId: {
              studentId: fg.studentId,
              classId: classIdNum,
              semester: fg.semester,
              schoolYearId,
            },
          },
          update: {
            grade: fg.grade,
            conductNoteWish: fg.conductNoteWish,
          },
          create: {
            studentId: fg.studentId,
            classId: classIdNum,
            semester: fg.semester,
            schoolYearId,
            grade: fg.grade,
            conductNoteWish: fg.conductNoteWish,
          },
        })
      }

      return { count: writable.length, skippedLocked }
    })

    return NextResponse.json({ success: true, count, skippedLocked })
  } catch (error) {
    captureError(error as Error, {
      location: 'api/notensammler/final-grades/batch',
      type: 'save-final-grades-batch',
      extra: {
        requestData,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    })
    return NextResponse.json(
      {
        error: 'Failed to save final grades',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
