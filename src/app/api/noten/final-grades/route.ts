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

/**
 * PATCH: Save final grades (Endnote + Betragen) for the noten page when Notensammler feature may be disabled.
 * Body: { classId, schoolYearId?, finalGrades: Array<{ studentId, semester, grade?, conductNoteWish? }> }
 */
export async function PATCH(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  let requestData: unknown
  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isFeatureEnabled('noten'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const body = (await request.json()) as {
      classId: unknown
      schoolYearId?: number
      adminOverride?: boolean
      finalGrades: Array<{
        studentId: unknown
        semester: unknown
        grade?: unknown
        conductNoteWish?: string | null
      }>
    }
    const { classId, schoolYearId: bodySchoolYearId, finalGrades: rawFinalGrades } = body
    // Keep only non-PII identifiers in the error log — never the grade values.
    requestData = {
      classId,
      schoolYearId: bodySchoolYearId,
      finalGradesCount: Array.isArray(rawFinalGrades) ? rawFinalGrades.length : 0,
    }

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

    const schoolYearId = await resolveSchoolYearId(bodySchoolYearId)
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    const isAssignedToClass = await prisma.teacherAssignment.findFirst({
      where: { teacherId: teacher.id, classId: classIdNum, schoolYearId },
    })
    if (!isAssignedToClass) {
      return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
    }

    const classRecord = await prisma.class.findUnique({
      where: { id: classIdNum },
    })
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

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
      }
      if (
        fg.conductNoteWish !== undefined &&
        fg.conductNoteWish !== null &&
        fg.conductNoteWish !== ''
      ) {
        if (
          !ALLOWED_CONDUCT_NOTE_WISH.includes(
            fg.conductNoteWish as (typeof ALLOWED_CONDUCT_NOTE_WISH)[number],
          )
        ) {
          return NextResponse.json(
            {
              error: `conductNoteWish must be one of: ${ALLOWED_CONDUCT_NOTE_WISH.join(', ')} or null at index ${i}`,
            },
            { status: 400 },
          )
        }
      }
    }

    // Normalise the validated entries once.
    const parsed = rawFinalGrades.map(fg => {
      const studentId =
        typeof fg.studentId === 'string' ? parseInt(fg.studentId, 10) : (fg.studentId as number)
      let gradeValue: number | null = null
      if (fg.grade !== null && fg.grade !== undefined) {
        gradeValue = typeof fg.grade === 'string' ? parseFloat(fg.grade) : (fg.grade as number)
      }
      let conductNoteWishValue: string | null = null
      if (
        fg.conductNoteWish !== undefined &&
        fg.conductNoteWish !== null &&
        fg.conductNoteWish !== ''
      ) {
        conductNoteWishValue = fg.conductNoteWish
      }
      return {
        studentId,
        semester: fg.semester as 'first' | 'second',
        grade: gradeValue,
        conductNoteWish: conductNoteWishValue,
      }
    })

    // Respect the Sokrates hard lock exactly as the notensammler batch route
    // does: a marked+locked semester freezes the Zeugnisnote for everyone but the
    // class lead / admin. This route writes the same FinalGrade rows, so without
    // the guard it was an unguarded parallel write path around the lock
    // (finding 5). Re-read the mark state and apply every write under the shared
    // advisory lock so a mark committing mid-request cannot slip through.
    const canOverride = await canManageSokrates({
      classId: classIdNum,
      role: session.user?.role,
      teacherId: teacher.id,
      adminOverride: body.adminOverride === true,
    })

    const { count, skippedLocked } = await withSokratesLock(
      classIdNum,
      schoolYearId,
      async tx => {
        const sokratesStatus = await getSokratesStatus(classIdNum, schoolYearId, tx)
        let writable = parsed
        let skippedLocked = 0
        if (sokratesStatus.first.marked || sokratesStatus.second.marked) {
          writable = parsed.filter(
            fg => !isFinalGradeEditBlocked(sokratesStatus, fg.semester, canOverride),
          )
          skippedLocked = parsed.length - writable.length
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
            update: { grade: fg.grade, conductNoteWish: fg.conductNoteWish },
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
      },
    )

    return NextResponse.json({ success: true, count, skippedLocked })
  } catch (error) {
    captureError(error as Error, {
      location: 'api/noten/final-grades',
      type: 'patch-final-grades',
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
