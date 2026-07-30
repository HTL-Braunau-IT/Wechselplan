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
  isEditBlocked,
  recordSokratesChanges,
  withSokratesLock,
  type GradeChange,
} from '@/lib/sokrates-lock'
import { actorName, resolveCurrentTeacher } from '@/lib/current-teacher'
import { notifyGradesEntered } from '../_notify'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7]
const MAX_GRADES_BATCH = 400

type GradeEntry = {
  studentId: number
  teacherId: number
  semester: 'first' | 'second'
  grade: number | null
}

/**
 * Handles POST requests to save or update multiple grades in one transaction.
 * Body: { classId, schoolYearId?, grades: Array<{ studentId, teacherId, semester, grade }> }
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
      grades: Array<{ studentId: unknown; teacherId: unknown; semester: unknown; grade: unknown }>
      adminOverride?: unknown
    }
    requestData = body
    const { classId, schoolYearId: bodySchoolYearId, grades: rawGrades } = body

    if (!rawGrades || !Array.isArray(rawGrades)) {
      return NextResponse.json({ error: 'grades must be a non-empty array' }, { status: 400 })
    }
    if (rawGrades.length > MAX_GRADES_BATCH) {
      return NextResponse.json(
        { error: `Too many grades. Maximum ${MAX_GRADES_BATCH} per request.` },
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

    // Parse and validate each entry
    const grades: GradeEntry[] = []
    for (let i = 0; i < rawGrades.length; i++) {
      const g = rawGrades[i]!
      const studentId =
        typeof g.studentId === 'string'
          ? parseInt(g.studentId, 10)
          : typeof g.studentId === 'number'
            ? g.studentId
            : NaN
      const teacherId =
        typeof g.teacherId === 'string'
          ? parseInt(g.teacherId, 10)
          : typeof g.teacherId === 'number'
            ? g.teacherId
            : NaN
      if (isNaN(studentId) || isNaN(teacherId)) {
        return NextResponse.json(
          { error: `Invalid studentId or teacherId at index ${i}` },
          { status: 400 },
        )
      }
      if (g.semester !== 'first' && g.semester !== 'second') {
        return NextResponse.json(
          { error: `Semester must be "first" or "second" at index ${i}` },
          { status: 400 },
        )
      }
      let gradeValue: number | null = null
      if (g.grade !== null && g.grade !== undefined) {
        const num =
          typeof g.grade === 'string'
            ? parseFloat(g.grade)
            : typeof g.grade === 'number'
              ? g.grade
              : NaN
        if (isNaN(num) || !ALLOWED_GRADES.includes(num)) {
          return NextResponse.json(
            { error: `Grade must be one of: ${ALLOWED_GRADES.join(', ')} or null at index ${i}` },
            { status: 400 },
          )
        }
        gradeValue = num
      }
      grades.push({
        studentId,
        teacherId,
        semester: g.semester as 'first' | 'second',
        grade: gradeValue,
      })
    }

    // The grades already on file, keyed the same way as the incoming batch.
    // Needed twice over: to tell an actual edit from a resave (only the former
    // is gated by a Sokrates lock, and only the former is worth telling the
    // class lead about), and to count what really moved.
    const existing = await prisma.grade.findMany({
      where: { classId: classIdNum, schoolYearId },
      select: { studentId: true, teacherId: true, semester: true, grade: true },
    })
    const existingMap = new Map<string, number | null>()
    for (const e of existing) {
      existingMap.set(`${e.studentId}:${e.teacherId}:${e.semester}`, e.grade)
    }
    const gradeKey = (g: GradeEntry) => `${g.studentId}:${g.teacherId}:${g.semester}`
    const changed = grades.filter(g => (existingMap.get(gradeKey(g)) ?? null) !== g.grade)

    const currentTeacher = await resolveCurrentTeacher(session)
    const canOverride = await canManageSokrates({
      classId: classIdNum,
      role: session.user?.role,
      teacherId: currentTeacher?.id ?? null,
      adminOverride: body.adminOverride === true,
    })

    // Sokrates lock: a hard-locked grade that would change is skipped (not
    // written) rather than failing the whole "Alle speichern" — unrelated edits
    // in the same batch still persist. Changes that land on a marked semester
    // are collected so we can notify the class lead after the write. Unchanged
    // cells are never blocked or reported.
    //
    // The mark state is re-read and the write applied under the shared advisory
    // lock, so a mark committing mid-request cannot leave a hard-locked cell
    // written: whichever of the two runs second sees the other's commit.
    const { sokratesStatus, anyMarked, sokratesChanges, blockedKeys, writtenCount } =
      await withSokratesLock(classIdNum, schoolYearId, async tx => {
        const sokratesStatus = await getSokratesStatus(classIdNum, schoolYearId, tx)
        const anyMarked = sokratesStatus.first.marked || sokratesStatus.second.marked
        const sokratesChanges: GradeChange[] = []
        const blockedKeys = new Set<string>()
        if (anyMarked) {
          for (const g of changed) {
            if (!sokratesStatus[g.semester].marked) continue
            const key = gradeKey(g)
            if (isEditBlocked(sokratesStatus, g.semester, g.teacherId, canOverride)) {
              blockedKeys.add(key)
            } else {
              sokratesChanges.push({
                studentId: g.studentId,
                teacherId: g.teacherId,
                semester: g.semester,
                oldGrade: existingMap.get(key) ?? null,
                newGrade: g.grade,
              })
            }
          }
        }

        // Locked-and-changed cells are dropped from the write; everything else saves.
        const gradesToWrite =
          blockedKeys.size === 0
            ? grades
            : grades.filter(g => !blockedKeys.has(`${g.studentId}:${g.teacherId}:${g.semester}`))

        for (const g of gradesToWrite) {
          await tx.grade.upsert({
            where: {
              studentId_teacherId_classId_semester_schoolYearId: {
                studentId: g.studentId,
                teacherId: g.teacherId,
                classId: classIdNum,
                semester: g.semester,
                schoolYearId,
              },
            },
            update: { grade: g.grade },
            create: {
              studentId: g.studentId,
              teacherId: g.teacherId,
              classId: classIdNum,
              semester: g.semester,
              schoolYearId,
              grade: g.grade,
            },
          })
        }

        return {
          sokratesStatus,
          anyMarked,
          sokratesChanges,
          blockedKeys,
          writtenCount: gradesToWrite.length,
        }
      })

    if (anyMarked && sokratesChanges.length > 0) {
      await recordSokratesChanges({
        classId: classIdNum,
        schoolYearId,
        changedById: currentTeacher?.id ?? null,
        changedByName: actorName(currentTeacher, session),
        status: sokratesStatus,
        changes: sokratesChanges,
      })
    }

    await notifyGradesEntered({
      classId: classIdNum,
      className: classRecord.name,
      schoolYearId,
      actor: currentTeacher,
      session,
      count: changed.filter(g => !blockedKeys.has(gradeKey(g))).length,
    })

    return NextResponse.json({
      success: true,
      count: writtenCount,
      skippedLocked: blockedKeys.size,
    })
  } catch (error) {
    captureError(error as Error, {
      location: 'api/notensammler/grades/batch',
      type: 'save-grades-batch',
      extra: {
        requestData,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    })
    return NextResponse.json(
      {
        error: 'Failed to save grades',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
