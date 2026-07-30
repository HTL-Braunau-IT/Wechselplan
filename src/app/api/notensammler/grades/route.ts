import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { requireAccess } from '@/lib/api-guard'
import {
  canManageSokrates,
  getSokratesStatus,
  isEditBlocked,
  recordSokratesChanges,
  withSokratesLock,
} from '@/lib/sokrates-lock'
import { actorName, resolveCurrentTeacher } from '@/lib/current-teacher'
import { resolveSchoolYearId } from '@/lib/school-year'
import { notifyGradesEntered } from './_notify'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]

/**
 * Handles GET requests to retrieve all grades for a specific class.
 *
 * Returns grades grouped by student, teacher, and semester.
 *
 * @returns A JSON response containing grades in the format:
 * { [studentId]: { [teacherId]: { first: grade | null, second: grade | null } } }
 */
export async function GET(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const classIdParam = searchParams.get('classId')
    const schoolYearIdParam = searchParams.get('schoolYearId')

    if (!classIdParam) {
      return NextResponse.json({ error: 'classId parameter is required' }, { status: 400 })
    }

    const classId = parseInt(classIdParam)
    if (isNaN(classId)) {
      return NextResponse.json({ error: 'Invalid classId' }, { status: 400 })
    }

    // Resolve school year: from query or current
    const schoolYearId = await resolveSchoolYearId(schoolYearIdParam)
    if (schoolYearId == null) {
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    // Verify class exists
    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
    })

    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // Fetch all grades for this class and school year
    const grades = await prisma.grade.findMany({
      where: { classId, schoolYearId },
      select: {
        studentId: true,
        teacherId: true,
        semester: true,
        grade: true,
      },
    })

    console.log(
      `[GET /api/notensammler/grades] Found ${grades.length} grades for classId ${classId}`,
    )

    // Group grades by student, then teacher, then semester
    const gradesByStudent: Record<
      number,
      Record<number, { first: number | null; second: number | null }>
    > = {}

    for (const gradeRecord of grades) {
      gradesByStudent[gradeRecord.studentId] ??= {}
      const studentGrades = gradesByStudent[gradeRecord.studentId]!
      studentGrades[gradeRecord.teacherId] ??= {
        first: null,
        second: null,
      }
      const teacherGrades = studentGrades[gradeRecord.teacherId]!
      if (gradeRecord.semester === 'first') {
        teacherGrades.first = gradeRecord.grade
      } else if (gradeRecord.semester === 'second') {
        teacherGrades.second = gradeRecord.grade
      }
    }

    // Fetch final grades for this class and school year (including Betragensnote Wunsch)
    const finalGradeRecords = await prisma.finalGrade.findMany({
      where: { classId, schoolYearId },
      select: { studentId: true, semester: true, grade: true, conductNoteWish: true },
    })

    const finalGrades: Record<
      number,
      {
        first: number | null
        second: number | null
        conductWishFirst: string | null
        conductWishSecond: string | null
      }
    > = {}
    for (const fg of finalGradeRecords) {
      finalGrades[fg.studentId] ??= {
        first: null,
        second: null,
        conductWishFirst: null,
        conductWishSecond: null,
      }
      if (fg.semester === 'first') {
        finalGrades[fg.studentId]!.first = fg.grade
        finalGrades[fg.studentId]!.conductWishFirst = fg.conductNoteWish ?? null
      } else if (fg.semester === 'second') {
        finalGrades[fg.studentId]!.second = fg.grade
        finalGrades[fg.studentId]!.conductWishSecond = fg.conductNoteWish ?? null
      }
    }

    console.log(
      `[GET /api/notensammler/grades] Returning ${Object.keys(gradesByStudent).length} students with grades`,
    )
    return NextResponse.json({ grades: gradesByStudent, finalGrades })
  } catch (error) {
    captureError(error, {
      location: 'api/notensammler/grades',
      type: 'fetch-grades',
    })
    return NextResponse.json({ error: 'Failed to fetch grades' }, { status: 500 })
  }
}

/**
 * Handles POST requests to save or update a grade.
 *
 * Validates the grade value (must be one of: 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, or null),
 * verifies that student, teacher, and class exist, and upserts the grade record.
 *
 * @returns A JSON response with success status or an error message.
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
      studentId: unknown
      teacherId: unknown
      classId: unknown
      semester: unknown
      grade: unknown
      schoolYearId?: number
      adminOverride?: unknown
    }
    requestData = body
    const { studentId, teacherId, classId, semester, grade, schoolYearId: bodySchoolYearId } = body

    // Resolve school year: from body or current
    const schoolYearId = await resolveSchoolYearId(bodySchoolYearId)
    if (schoolYearId == null) {
      return NextResponse.json(
        {
          error: 'No school year found. Create a school year in Admin / Data / School Years first.',
        },
        { status: 400 },
      )
    }

    // Validate required fields
    if (
      studentId === undefined ||
      teacherId === undefined ||
      classId === undefined ||
      semester === undefined
    ) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, teacherId, classId, semester' },
        { status: 400 },
      )
    }

    // Validate semester
    if (semester !== 'first' && semester !== 'second') {
      return NextResponse.json({ error: 'Semester must be "first" or "second"' }, { status: 400 })
    }

    // Validate grade value (can be null or one of the allowed values)
    if (grade !== null && grade !== undefined) {
      const gradeNum =
        typeof grade === 'string' ? parseFloat(grade) : typeof grade === 'number' ? grade : NaN
      if (isNaN(gradeNum) || !ALLOWED_GRADES.includes(gradeNum)) {
        return NextResponse.json(
          { error: `Grade must be one of: ${ALLOWED_GRADES.join(', ')} or null` },
          { status: 400 },
        )
      }
    }

    // Parse IDs
    const studentIdNum =
      typeof studentId === 'string'
        ? parseInt(studentId)
        : typeof studentId === 'number'
          ? studentId
          : NaN
    const teacherIdNum =
      typeof teacherId === 'string'
        ? parseInt(teacherId)
        : typeof teacherId === 'number'
          ? teacherId
          : NaN
    const classIdNum =
      typeof classId === 'string' ? parseInt(classId) : typeof classId === 'number' ? classId : NaN

    if (isNaN(studentIdNum) || isNaN(teacherIdNum) || isNaN(classIdNum)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    // Verify student exists
    const student = await prisma.student.findUnique({
      where: { id: studentIdNum },
    })
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    // Verify teacher exists
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherIdNum },
    })
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }

    // Verify class exists
    const classRecord = await prisma.class.findUnique({
      where: { id: classIdNum },
    })
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // Upsert grade (create or update)
    const gradeValue =
      grade === null || grade === undefined
        ? null
        : typeof grade === 'number'
          ? grade
          : typeof grade === 'string'
            ? parseFloat(grade)
            : null

    // Sokrates lock enforcement: once a class+semester is marked as entered into
    // Sokrates, a hard lock blocks non-class-leads from changing it; a soft mark
    // allows the change but records it and notifies the class lead (below).
    const semesterTyped = semester as 'first' | 'second'
    const currentTeacher = await resolveCurrentTeacher(session)
    const canOverride = await canManageSokrates({
      classId: classIdNum,
      role: session.user?.role,
      teacherId: currentTeacher?.id ?? null,
      adminOverride: body.adminOverride === true,
    })

    // Re-read the mark state and gate the write under the shared advisory lock,
    // so a mark that commits after the last read cannot slip its hard lock in
    // ahead of this grade. The change-recording + notify below run afterwards,
    // outside the lock — they are best-effort and must not hold it.
    const write = await withSokratesLock(classIdNum, schoolYearId, async tx => {
      const sokratesStatus = await getSokratesStatus(classIdNum, schoolYearId, tx)
      const semesterMarked = sokratesStatus[semesterTyped].marked

      const existingGrade = await tx.grade.findUnique({
        where: {
          studentId_teacherId_classId_semester_schoolYearId: {
            studentId: studentIdNum,
            teacherId: teacherIdNum,
            classId: classIdNum,
            semester: semesterTyped,
            schoolYearId,
          },
        },
        select: { grade: true },
      })
      const previousGrade = existingGrade?.grade ?? null
      const gradeChanged = previousGrade !== gradeValue

      // Re-saving the same value is a no-op — never block it (mirrors the batch
      // route, and the documented contract). Only an actual change is gated.
      if (
        semesterMarked &&
        gradeChanged &&
        isEditBlocked(sokratesStatus, semesterTyped, teacherIdNum, canOverride)
      ) {
        return { blocked: true as const }
      }

      const result = await tx.grade.upsert({
        where: {
          studentId_teacherId_classId_semester_schoolYearId: {
            studentId: studentIdNum,
            teacherId: teacherIdNum,
            classId: classIdNum,
            semester: semesterTyped,
            schoolYearId,
          },
        },
        update: {
          grade: gradeValue,
        },
        create: {
          studentId: studentIdNum,
          teacherId: teacherIdNum,
          classId: classIdNum,
          semester: semesterTyped,
          schoolYearId,
          grade: gradeValue,
        },
      })

      return {
        blocked: false as const,
        result,
        previousGrade,
        gradeChanged,
        semesterMarked,
        sokratesStatus,
      }
    })

    if (write.blocked) {
      return NextResponse.json(
        {
          error:
            'Diese Note wurde bereits in Sokrates eingetragen und ist gesperrt. Bitte den Klassenleiter kontaktieren.',
        },
        { status: 423 },
      )
    }

    const { result, previousGrade, gradeChanged, semesterMarked, sokratesStatus } = write

    // Marked-then-changed → record + notify the class lead (no-op if unchanged
    // or if the class lead made the change themselves).
    if (semesterMarked) {
      await recordSokratesChanges({
        classId: classIdNum,
        schoolYearId,
        changedById: currentTeacher?.id ?? null,
        changedByName: actorName(currentTeacher, session),
        status: sokratesStatus,
        changes: [
          {
            studentId: studentIdNum,
            teacherId: teacherIdNum,
            semester: semesterTyped,
            oldGrade: previousGrade,
            newGrade: gradeValue,
          },
        ],
      })
    }

    await notifyGradesEntered({
      classId: classIdNum,
      className: classRecord.name,
      schoolYearId,
      actor: currentTeacher,
      session,
      count: gradeChanged ? 1 : 0,
    })

    return NextResponse.json({ success: true, grade: result })
  } catch (error) {
    console.error('Error saving grade:', error)
    console.error('Request data:', requestData)
    captureError(error, {
      location: 'api/notensammler/grades',
      type: 'save-grade',
      extra: {
        requestData,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    })
    return NextResponse.json(
      {
        error: 'Failed to save grade',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

/**
 * Handles DELETE requests to remove all grades for a specific teacher in a class.
 *
 * Deletes all Grade records matching teacherId and classId (both first and second semester).
 *
 * @returns A JSON response with success status or an error message.
 */
export async function DELETE(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const teacherIdParam = searchParams.get('teacherId')
    const classIdParam = searchParams.get('classId')

    if (!teacherIdParam || !classIdParam) {
      return NextResponse.json(
        { error: 'teacherId and classId parameters are required' },
        { status: 400 },
      )
    }

    const teacherId = parseInt(teacherIdParam)
    const classId = parseInt(classIdParam)

    if (isNaN(teacherId) || isNaN(classId)) {
      return NextResponse.json({ error: 'Invalid teacherId or classId format' }, { status: 400 })
    }

    // A destructive bulk delete must name its year explicitly — never fall back
    // to "current", which could silently wipe the wrong year's grades. The
    // client always sends it.
    const schoolYearIdParam = searchParams.get('schoolYearId')
    const schoolYearId = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : NaN
    if (Number.isNaN(schoolYearId)) {
      return NextResponse.json({ error: 'schoolYearId parameter is required' }, { status: 400 })
    }

    // Verify teacher exists
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
    })
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }

    // Verify class exists
    const classRecord = await prisma.class.findUnique({
      where: { id: classId },
    })
    if (!classRecord) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }

    // Respect the Sokrates lock the POST and batch write paths enforce: once a
    // class+semester is entered into Sokrates and hard-locked for this teacher,
    // a bulk delete must not slip past it. Class leads/admins may still override.
    const currentTeacher = await resolveCurrentTeacher(session)
    const canOverride = await canManageSokrates({
      classId,
      role: session.user?.role,
      teacherId: currentTeacher?.id ?? null,
      adminOverride: false,
    })
    const sokratesStatus = await getSokratesStatus(classId, schoolYearId)
    if (
      isEditBlocked(sokratesStatus, 'first', teacherId, canOverride) ||
      isEditBlocked(sokratesStatus, 'second', teacherId, canOverride)
    ) {
      return NextResponse.json(
        { error: 'Diese Klasse ist für Sokrates gesperrt.' },
        { status: 423 },
      )
    }

    // Delete this teacher's grades for the class in the given school year.
    const result = await prisma.grade.deleteMany({
      where: {
        teacherId,
        classId,
        schoolYearId,
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    })
  } catch (error) {
    captureError(error, {
      location: 'api/notensammler/grades',
      type: 'delete-teacher-grades',
    })
    return NextResponse.json({ error: 'Failed to delete grades' }, { status: 500 })
  }
}
