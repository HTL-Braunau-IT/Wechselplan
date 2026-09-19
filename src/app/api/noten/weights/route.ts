import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import { isFeatureEnabled } from '@/lib/entitlements'
import { resolveSessionTeacher } from '@/lib/session-teacher'
import { requireAccess } from '@/lib/api-guard'
import { type WeightLevel } from '@/lib/noten-weights'

/**
 * PATCH: Set or clear a teacher's Noten weights at one level of the override
 * chain — global (per teacher), class (per teacher/class/year) or group (per
 * teacher/class/group/year). `clear: true` deletes that level's row so the
 * context re-inherits from the next level up. Otherwise the four weights are
 * upserted and must sum to 100.
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

    const body = (await request.json()) as {
      level?: WeightLevel
      clear?: boolean
      classId?: number
      groupId?: number
      schoolYearId?: number
      weightWiederholung?: number
      weightBericht?: number
      weightMitarbeit?: number
      weightPraktischeArbeit?: number
    }

    // Default to 'group' so a pre-hierarchy client (which sent no level) still
    // writes the group override it always did.
    const level: WeightLevel = body.level ?? 'group'
    if (level !== 'global' && level !== 'class' && level !== 'group') {
      return NextResponse.json({ error: 'Invalid level' }, { status: 400 })
    }

    const { classId, groupId, schoolYearId } = body

    // Which identifiers each level needs. Global is scoped to the teacher only
    // (and deliberately not by year); class needs the class + year; group also
    // needs the group.
    if (level !== 'global' && (classId == null || schoolYearId == null)) {
      return NextResponse.json({ error: 'Missing classId or schoolYearId' }, { status: 400 })
    }
    if (level === 'group' && groupId == null) {
      return NextResponse.json({ error: 'Missing groupId' }, { status: 400 })
    }

    const teacher = await resolveSessionTeacher(session)
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 403 })
    }

    // Class and group levels require the teacher to actually teach the class.
    // The global level is the teacher's own default and needs no assignment.
    if (level !== 'global') {
      const isAssignedToClass = await prisma.teacherAssignment.findFirst({
        where: { teacherId: teacher.id, classId: classId!, schoolYearId: schoolYearId! },
      })
      if (!isAssignedToClass) {
        return NextResponse.json({ error: 'Not assigned to this class' }, { status: 403 })
      }
    }

    if (body.clear) {
      // Deleting the level's row makes the context inherit again. deleteMany is
      // a no-op (not an error) when nothing was set, which is what we want.
      if (level === 'global') {
        await prisma.notenWeightGlobalConfig.deleteMany({ where: { teacherId: teacher.id } })
      } else if (level === 'class') {
        await prisma.notenWeightClassConfig.deleteMany({
          where: { teacherId: teacher.id, classId: classId!, schoolYearId: schoolYearId! },
        })
      } else {
        await prisma.notenWeightConfig.deleteMany({
          where: {
            teacherId: teacher.id,
            classId: classId!,
            groupId: groupId!,
            schoolYearId: schoolYearId!,
          },
        })
      }
      return NextResponse.json({ success: true })
    }

    // Bound each field to [0,100] before the sum check. The client enforces
    // min=0/max=100, but a direct request could send e.g. {200,-100,0,0} (sum
    // 100) which drives the weighted day-grade outside 1-5 or the divisor to 0,
    // silently dropping a day from the average (finding 18).
    const weightFields = [
      body.weightWiederholung,
      body.weightBericht,
      body.weightMitarbeit,
      body.weightPraktischeArbeit,
    ]
    if (weightFields.some(w => w == null)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const nums = weightFields.map(Number)
    if (nums.some(w => !Number.isFinite(w) || w < 0 || w > 100)) {
      return NextResponse.json(
        { error: 'Each weight must be a number between 0 and 100' },
        { status: 400 },
      )
    }
    if (nums.reduce((acc, w) => acc + w, 0) !== 100) {
      return NextResponse.json({ error: 'Weights must sum to 100' }, { status: 400 })
    }

    const [weightWiederholung, weightBericht, weightMitarbeit, weightPraktischeArbeit] = nums as [
      number,
      number,
      number,
      number,
    ]
    const weightData = {
      weightWiederholung,
      weightBericht,
      weightMitarbeit,
      weightPraktischeArbeit,
    }

    if (level === 'global') {
      await prisma.notenWeightGlobalConfig.upsert({
        where: { teacherId: teacher.id },
        create: { teacherId: teacher.id, ...weightData },
        update: weightData,
      })
    } else if (level === 'class') {
      await prisma.notenWeightClassConfig.upsert({
        where: {
          teacherId_classId_schoolYearId: {
            teacherId: teacher.id,
            classId: classId!,
            schoolYearId: schoolYearId!,
          },
        },
        create: { teacherId: teacher.id, classId: classId!, schoolYearId: schoolYearId!, ...weightData },
        update: weightData,
      })
    } else {
      await prisma.notenWeightConfig.upsert({
        where: {
          teacherId_classId_groupId_schoolYearId: {
            teacherId: teacher.id,
            classId: classId!,
            groupId: groupId!,
            schoolYearId: schoolYearId!,
          },
        },
        create: {
          teacherId: teacher.id,
          classId: classId!,
          groupId: groupId!,
          schoolYearId: schoolYearId!,
          ...weightData,
        },
        update: weightData,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    captureError(error, {
      location: 'api/noten/weights',
      type: 'save-weights',
    })
    return NextResponse.json({ error: 'Failed to save weights' }, { status: 500 })
  }
}
