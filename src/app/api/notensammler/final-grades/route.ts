import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { denyUnlessAccess } from '@/lib/api-guard'
import {
  canManageSokrates,
  getSokratesStatus,
  isFinalGradeEditBlocked,
  resolveCurrentTeacher,
  withSokratesLock,
} from '@/lib/sokrates-lock'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Endnote: integer grades only (no .5) plus 6 = nicht beurteilt, 7 = gestundet
const ALLOWED_FINAL_GRADES = [1, 2, 3, 4, 5, 6, 7]

// Betragensnote (Wunsch) allowed values
const ALLOWED_CONDUCT_NOTE_WISH = [
  'Sehr zufriedenstellend',
  'Zufriedenstellend',
  'Wenig Zufriedenstellend',
  'Nicht zufriedenstellend',
] as const

/**
 * Handles POST requests to save or update a final grade (Endnote).
 *
 * Validates the grade value (must be one of: 1, 2, 3, 4, 5, 6, 7 or null),
 * verifies that student and class exist, and upserts the FinalGrade record.
 *
 * @returns A JSON response with success status or an error message.
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

    const body = (await request.json()) as {
      studentId: unknown
      classId: unknown
      semester: unknown
      grade: unknown
      conductNoteWish?: string | null
      schoolYearId?: number
    }
    requestData = body
    const {
      studentId,
      classId,
      semester,
      grade,
      conductNoteWish,
      schoolYearId: bodySchoolYearId,
    } = body

    // Resolve school year: from body or current (today between start and end)
    let schoolYearId = bodySchoolYearId
    if (schoolYearId == null) {
      const now = new Date()
      const current = await prisma.schoolYear.findFirst({
        where: { startDate: { lte: now }, endDate: { gte: now } },
        select: { id: true },
      })
      schoolYearId =
        current?.id ??
        (
          await prisma.schoolYear.findFirst({
            orderBy: { startDate: 'desc' },
            select: { id: true },
          })
        )?.id
    }
    if (schoolYearId == null) {
      return NextResponse.json(
        {
          error: 'No school year found. Create a school year in Admin / Data / School Years first.',
        },
        { status: 400 },
      )
    }

    // Validate required fields
    if (studentId === undefined || classId === undefined || semester === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, classId, semester' },
        { status: 400 },
      )
    }

    // Validate semester
    if (semester !== 'first' && semester !== 'second') {
      return NextResponse.json({ error: 'Semester must be "first" or "second"' }, { status: 400 })
    }

    // Validate grade value (can be null or one of the allowed integer values)
    if (grade !== null && grade !== undefined) {
      const gradeNum =
        typeof grade === 'string'
          ? parseInt(grade, 10)
          : typeof grade === 'number'
            ? Math.floor(grade)
            : NaN
      if (
        isNaN(gradeNum) ||
        !ALLOWED_FINAL_GRADES.includes(gradeNum) ||
        (typeof grade === 'number' && grade !== gradeNum)
      ) {
        return NextResponse.json(
          {
            error: `Final grade must be one of: ${ALLOWED_FINAL_GRADES.join(', ')} (integer only) or null`,
          },
          { status: 400 },
        )
      }
    }

    // Parse IDs
    const studentIdNum =
      typeof studentId === 'string'
        ? parseInt(studentId, 10)
        : typeof studentId === 'number'
          ? studentId
          : NaN
    const classIdNum =
      typeof classId === 'string'
        ? parseInt(classId, 10)
        : typeof classId === 'number'
          ? classId
          : NaN

    if (isNaN(studentIdNum) || isNaN(classIdNum)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    // Verify student exists
    const student = await prisma.student.findUnique({
      where: { id: studentIdNum },
    })
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // Verify class exists
    const classRecord = await prisma.class.findUnique({
      where: { id: classIdNum },
    })
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const semesterTyped = semester as 'first' | 'second'

    // Parse grade value
    const gradeValue =
      grade === null || grade === undefined
        ? null
        : typeof grade === 'number'
          ? grade
          : typeof grade === 'string'
            ? parseInt(grade, 10)
            : null

    // Validate conductNoteWish (Betragensnote Wunsch) if provided
    let conductNoteWishValue: string | null = null
    if (conductNoteWish !== undefined && conductNoteWish !== null) {
      if (conductNoteWish === '') {
        conductNoteWishValue = null
      } else if (
        typeof conductNoteWish === 'string' &&
        ALLOWED_CONDUCT_NOTE_WISH.includes(
          conductNoteWish as (typeof ALLOWED_CONDUCT_NOTE_WISH)[number],
        )
      ) {
        conductNoteWishValue = conductNoteWish
      } else {
        return NextResponse.json(
          {
            error: `conductNoteWish must be one of: ${ALLOWED_CONDUCT_NOTE_WISH.join(', ')} or null`,
          },
          { status: 400 },
        )
      }
    }

    // Sokrates lock: the Zeugnisnote is the number that was typed into Sokrates,
    // so a locked semester freezes it for everyone but the class lead and admins.
    // Unlike a teacher column there is nothing to scope a per-subject lock to —
    // only the blanket lock applies (see isFinalGradeEditBlocked).
    //
    // The mark state is re-read and the write applied under the shared advisory
    // lock, so a mark committing mid-request cannot land its hard lock after
    // this endpoint decided the semester was still editable.
    const currentTeacher = await resolveCurrentTeacher(session)
    const canOverride = await canManageSokrates({
      classId: classIdNum,
      role: session.user?.role,
      teacherId: currentTeacher?.id ?? null,
    })

    const write = await withSokratesLock(classIdNum, schoolYearId, async tx => {
      const sokratesStatus = await getSokratesStatus(classIdNum, schoolYearId, tx)
      if (isFinalGradeEditBlocked(sokratesStatus, semesterTyped, canOverride)) {
        return { blocked: true as const }
      }

      const result = await tx.finalGrade.upsert({
        where: {
          studentId_classId_semester_schoolYearId: {
            studentId: studentIdNum,
            classId: classIdNum,
            semester: semesterTyped,
            schoolYearId,
          },
        },
        update: {
          ...(grade !== undefined && { grade: gradeValue }),
          ...(conductNoteWish !== undefined && { conductNoteWish: conductNoteWishValue }),
        },
        create: {
          studentId: studentIdNum,
          classId: classIdNum,
          semester: semesterTyped,
          schoolYearId,
          grade: gradeValue,
          conductNoteWish: conductNoteWishValue,
        },
      })
      return { blocked: false as const, result }
    })

    if (write.blocked) {
      return NextResponse.json(
        {
          error:
            'Die Noten dieser Klasse sind nach der Sokrates-Übertragung gesperrt. Bitte wende dich an den Klassenleiter.',
        },
        { status: 403 },
      )
    }

    return NextResponse.json({ success: true, finalGrade: write.result })
  } catch (error) {
    captureError(error, {
      location: 'api/notensammler/final-grades',
      type: 'save-final-grade',
      extra: {
        requestData,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    })
    return NextResponse.json(
      {
        error: 'Failed to save final grade',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
