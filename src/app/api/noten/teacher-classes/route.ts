import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'

/**
 * GET: Returns classes the current teacher is assigned to, each with all group IDs for that class
 * (from any teacher's assignment in the school year). Used for class and group tabs on the Noten page.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isFeatureEnabled('noten'))) {
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

    const teacher = await resolveSessionTeacher(session)

    if (!teacher) {
      return NextResponse.json({ classes: [] })
    }

    const myAssignments = await prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id, schoolYearId },
      select: { classId: true },
    })
    const classIds = [...new Set(myAssignments.map(a => a.classId))]
    if (classIds.length === 0) {
      return NextResponse.json({ classes: [] })
    }

    // All groups for these classes (from any teacher's assignment), so the UI can show all group tabs
    const allAssignments = await prisma.teacherAssignment.findMany({
      where: { classId: { in: classIds }, schoolYearId },
      select: { classId: true, groupId: true },
    })
    const byClass = new Map<number, Set<number>>()
    for (const a of allAssignments) {
      if (!byClass.has(a.classId)) byClass.set(a.classId, new Set())
      byClass.get(a.classId)!.add(a.groupId)
    }

    const classRecords = await prisma.class.findMany({
      where: { id: { in: classIds } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    const classes = classRecords.map(cls => ({
      id: cls.id,
      name: cls.name,
      groupIds: Array.from(byClass.get(cls.id) ?? []).sort((a, b) => a - b),
    }))

    return NextResponse.json({ classes })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/teacher-classes',
      type: 'fetch-teacher-classes',
    })
    return NextResponse.json({ error: 'Failed to fetch teacher classes' }, { status: 500 })
  }
}
