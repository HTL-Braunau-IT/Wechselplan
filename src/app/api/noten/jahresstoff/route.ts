import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'

/**
 * PATCH: Upsert the teacher's Jahresstoff for a class (teacher, class, school year).
 * Shared by every group of the class — there is no groupId.
 */
export async function PATCH(request: Request) {
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

    const body = await request.json()
    const { classId, schoolYearId, jahresstoff } = body as {
      classId?: number
      schoolYearId?: number
      jahresstoff?: string
    }

    if (classId == null || schoolYearId == null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    const isAssignedToClass = await prisma.teacherAssignment.findFirst({
      where: { teacherId: teacher.id, classId, schoolYearId },
    })
    if (!isAssignedToClass) {
      return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
    }

    await prisma.jahresstoffPerClass.upsert({
      where: {
        teacherId_classId_schoolYearId: { teacherId: teacher.id, classId, schoolYearId },
      },
      create: { teacherId: teacher.id, classId, schoolYearId, jahresstoff: jahresstoff ?? null },
      update: { jahresstoff: jahresstoff ?? null },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/jahresstoff',
      type: 'save-jahresstoff',
    })
    return NextResponse.json({ error: 'Failed to save Jahresstoff' }, { status: 500 })
  }
}
