import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import { denyUnlessAccess } from '@/lib/api-guard'
import {
  canManageSokrates,
  getSokratesStatus,
  isEditBlocked,
  isFinalGradeEditBlocked,
  resolveCurrentTeacher,
} from '@/lib/sokrates-lock'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_FINAL_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]
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
      classId: unknown
      schoolYearId?: number
      finalGrades: Array<{
        studentId: unknown
        semester: unknown
        grade?: unknown
        conductNoteWish?: string | null
      }>
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

    // Verify class exists
    const classRecord = await prisma.class.findUnique({
      where: { id: classIdNum },
    })
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    const username = normalizeUsername(session.user.name)
    const teacher = await prisma.teacher.findUnique({ where: { username } })
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
    // This endpoint also mirrors each Endnote into the caller's own grade column
    // (`gradeOps` below), so that half has to clear the column-level check too —
    // otherwise saving an Endnote would be a way around a locked column.
    const sokratesStatus = await getSokratesStatus(classIdNum, schoolYearId)
    let writable = finalGrades
    let columnWritable = finalGrades
    let skippedLocked = 0
    if (sokratesStatus.first.marked || sokratesStatus.second.marked) {
      const currentTeacher = await resolveCurrentTeacher(session)
      const canOverride = await canManageSokrates({
        classId: classIdNum,
        role: session.user?.role,
        teacherId: currentTeacher?.id ?? null,
      })
      writable = finalGrades.filter(
        fg => !isFinalGradeEditBlocked(sokratesStatus, fg.semester, canOverride),
      )
      columnWritable = writable.filter(
        fg => !isEditBlocked(sokratesStatus, fg.semester, teacher.id, canOverride),
      )
      skippedLocked = finalGrades.length - writable.length
    }

    const finalGradeOps = writable.map(fg =>
      prisma.finalGrade.upsert({
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
      }),
    )
    const gradeOps = columnWritable
      .filter(fg => fg.grade != null)
      .map(fg =>
        prisma.grade.upsert({
          where: {
            studentId_teacherId_classId_semester_schoolYearId: {
              studentId: fg.studentId,
              teacherId: teacher.id,
              classId: classIdNum,
              semester: fg.semester,
              schoolYearId,
            },
          },
          update: { grade: fg.grade },
          create: {
            studentId: fg.studentId,
            teacherId: teacher.id,
            classId: classIdNum,
            semester: fg.semester,
            schoolYearId,
            grade: fg.grade!,
          },
        }),
      )
    await prisma.$transaction([...finalGradeOps, ...gradeOps])

    return NextResponse.json({ success: true, count: writable.length, skippedLocked })
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
