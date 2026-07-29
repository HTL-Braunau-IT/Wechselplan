import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { generateNotensammlerAllClassesPDF } from '@/lib/pdf-generator'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { normalizeUsername } from '@/lib/username'
import type { NotensammlerAllClassesClassData } from '@/lib/pdf-generator'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * Handles GET requests to generate a PDF of the current teacher's grades for all classes they are assigned to in the given school year.
 *
 * @returns A PDF file as response, or JSON error with status 400/404/500.
 */
export async function GET(request: Request) {
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
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const schoolYearIdParam = searchParams.get('schoolYearId')
    let schoolYearId: number | undefined = schoolYearIdParam
      ? parseInt(schoolYearIdParam, 10)
      : undefined
    if (schoolYearId == null || Number.isNaN(schoolYearId)) {
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
      return NextResponse.json({ error: 'No school year found.' }, { status: 400 })
    }

    const username = normalizeUsername(session.user.name)
    const teacher = await prisma.teacher.findUnique({
      where: { username },
      select: { id: true, firstName: true, lastName: true },
    })

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }

    const assignments = await prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id, schoolYearId },
      select: { classId: true },
    })
    const distinctClassIds = Array.from(new Set(assignments.map(a => a.classId)))

    if (distinctClassIds.length === 0) {
      return NextResponse.json({ error: 'No classes assigned' }, { status: 400 })
    }

    const classRecords = await prisma.class.findMany({
      where: { id: { in: distinctClassIds } },
      orderBy: { name: 'asc' },
    })

    const classesPayload: NotensammlerAllClassesClassData[] = []

    for (const classRecord of classRecords) {
      const memberships = await prisma.classMembership.findMany({
        where: { classId: classRecord.id, schoolYearId },
        select: { studentId: true },
      })
      const studentIds = memberships.map(m => m.studentId)
      const studentsList =
        studentIds.length > 0
          ? await prisma.student.findMany({
              where: { id: { in: studentIds } },
              orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
              select: { id: true, firstName: true, lastName: true, groupId: true },
            })
          : []

      const assignmentsForClass = await prisma.teacherAssignment.findMany({
        where: { classId: classRecord.id, schoolYearId },
        include: {
          subject: { select: { name: true } },
        },
      })
      let subjectName: string | undefined
      const subjectCounts = new Map<string, number>()
      for (const a of assignmentsForClass) {
        if (a.subject?.name) {
          subjectCounts.set(a.subject.name, (subjectCounts.get(a.subject.name) ?? 0) + 1)
        }
      }
      let maxCount = 0
      for (const [name, count] of subjectCounts) {
        if (count > maxCount) {
          maxCount = count
          subjectName = name
        }
      }

      const grades = await prisma.grade.findMany({
        where: { classId: classRecord.id, teacherId: teacher.id, schoolYearId },
        select: { studentId: true, semester: true, grade: true },
      })
      const gradesForTeacher: Record<number, { first: number | null; second: number | null }> = {}
      for (const g of grades) {
        gradesForTeacher[g.studentId] ??= { first: null, second: null }
        if (g.semester === 'first') gradesForTeacher[g.studentId]!.first = g.grade
        if (g.semester === 'second') gradesForTeacher[g.studentId]!.second = g.grade
      }

      const finalGradeRecords = await prisma.finalGrade.findMany({
        where: { classId: classRecord.id, schoolYearId },
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

      classesPayload.push({
        className: classRecord.name,
        subjectName,
        students: studentsList,
        grades: gradesForTeacher,
        finalGrades,
      })
    }

    const teacherName = `${teacher.firstName} ${teacher.lastName}`.trim()
    const pdfBuffer = await generateNotensammlerAllClassesPDF({
      teacherName: teacherName || 'Lehrperson',
      classes: classesPayload,
    })

    const today = new Date().toISOString().slice(0, 10)
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=notensammler-alle-klassen-${today}.pdf`,
      },
    })
  } catch (error) {
    captureError(error as Error, {
      location: 'api/notensammler/pdf/all',
      type: 'export-pdf-all',
    })
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
