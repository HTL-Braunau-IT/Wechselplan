import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'

/**
 * PATCH: Upsert NotenWeightConfig for (teacher, class, group, school year). Sum of weights must be 100.
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
    const {
      classId,
      groupId,
      schoolYearId,
      weightWiederholung,
      weightBericht,
      weightMitarbeit,
      weightPraktischeArbeit,
    } = body as {
      classId?: number
      groupId?: number
      schoolYearId?: number
      weightWiederholung?: number
      weightBericht?: number
      weightMitarbeit?: number
      weightPraktischeArbeit?: number
    }

    if (
      classId == null ||
      groupId == null ||
      schoolYearId == null ||
      weightWiederholung == null ||
      weightBericht == null ||
      weightMitarbeit == null ||
      weightPraktischeArbeit == null
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // Bound each field to [0,100] before the sum check. The client enforces
    // min=0/max=100, but a direct request could send e.g. {200,-100,0,0} (sum
    // 100) which drives the weighted day-grade outside 1-5 or the divisor to 0,
    // silently dropping a day from the average (finding 18).
    const weightFields = [
      weightWiederholung,
      weightBericht,
      weightMitarbeit,
      weightPraktischeArbeit,
    ].map(Number)
    if (weightFields.some(w => !Number.isFinite(w) || w < 0 || w > 100)) {
      return NextResponse.json(
        { error: 'Each weight must be a number between 0 and 100' },
        { status: 400 },
      )
    }
    const sum = weightFields.reduce((acc, w) => acc + w, 0)
    if (sum !== 100) {
      return NextResponse.json({ error: 'Weights must sum to 100' }, { status: 400 })
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

    await prisma.notenWeightConfig.upsert({
      where: {
        teacherId_classId_groupId_schoolYearId: {
          teacherId: teacher.id,
          classId,
          groupId,
          schoolYearId,
        },
      },
      create: {
        teacherId: teacher.id,
        classId,
        groupId,
        schoolYearId,
        weightWiederholung: Number(weightWiederholung),
        weightBericht: Number(weightBericht),
        weightMitarbeit: Number(weightMitarbeit),
        weightPraktischeArbeit: Number(weightPraktischeArbeit),
      },
      update: {
        weightWiederholung: Number(weightWiederholung),
        weightBericht: Number(weightBericht),
        weightMitarbeit: Number(weightMitarbeit),
        weightPraktischeArbeit: Number(weightPraktischeArbeit),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/weights',
      type: 'save-weights',
    })
    return NextResponse.json({ error: 'Failed to save weights' }, { status: 500 })
  }
}
