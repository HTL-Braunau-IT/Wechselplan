import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'
import { MAX_SUPPORTED_STUDENTS } from '@/lib/schedule-limits'

interface CombineClassesRequest {
  combinedClassName: string
  memberClassIds: number[]
}

/**
 * Creates a combined class: a scheduling/grading LENS over two or more real
 * classes. Unlike the old implementation, this does NOT move students or rewrite
 * usernames — students stay in their member classes, so directory sync leaves
 * everything untouched. The combined class is its own `Class` row tagged
 * `isCombined`, linked to its members via CombinedClassMember. Roster and grade
 * resolution expand it through src/lib/combined-classes.ts.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const body = (await request.json()) as CombineClassesRequest
    const name = body.combinedClassName?.trim()
    const memberClassIds = Array.from(new Set(body.memberClassIds ?? [])).filter(
      id => Number.isInteger(id) && id > 0,
    )

    if (!name) {
      return NextResponse.json({ error: 'A name for the combined class is required' }, { status: 400 })
    }

    if (memberClassIds.length < 2) {
      return NextResponse.json(
        { error: 'A combined class needs at least two member classes' },
        { status: 400 },
      )
    }

    // Name must be free. A combined class must never reuse a real (synced) class
    // name — the unique constraint enforces exact collisions; sync additionally
    // ignores isCombined rows so a normalized name clash can't let sync adopt it.
    const existingClass = await prisma.class.findUnique({ where: { name } })
    if (existingClass) {
      return NextResponse.json({ error: 'A class with this name already exists' }, { status: 400 })
    }

    // All members must exist, be real (never combine combined classes), and active.
    const members = await prisma.class.findMany({
      where: { id: { in: memberClassIds } },
      select: { id: true, name: true, isCombined: true, isActive: true },
    })

    if (members.length !== memberClassIds.length) {
      return NextResponse.json({ error: 'One or more member classes were not found' }, { status: 404 })
    }

    const nested = members.find(m => m.isCombined)
    if (nested) {
      return NextResponse.json(
        { error: `Cannot combine an already-combined class (${nested.name})` },
        { status: 400 },
      )
    }

    // Guardrail: the merged roster must fit the schedule ceiling (see
    // src/lib/schedule-limits.ts). The wizard enforces this per schedule too.
    const totalStudents = await prisma.student.count({
      where: { classId: { in: memberClassIds }, isActive: true },
    })

    if (totalStudents > MAX_SUPPORTED_STUDENTS) {
      return NextResponse.json(
        {
          error: `Cannot combine classes: the combined roster would have ${totalStudents} students, but the maximum supported is ${MAX_SUPPORTED_STUDENTS}. Reduce the number of students before combining.`,
          details: { totalStudents, maxAllowed: MAX_SUPPORTED_STUDENTS },
        },
        { status: 400 },
      )
    }

    const combined = await prisma.$transaction(async tx => {
      const combinedClass = await tx.class.create({
        data: {
          name,
          description: `Combined class from ${members.map(m => m.name).join(', ')}`,
          isCombined: true,
          combinedMembers: {
            create: memberClassIds.map(memberClassId => ({ memberClassId })),
          },
        },
        include: {
          combinedMembers: { include: { memberClass: { select: { id: true, name: true } } } },
        },
      })
      return combinedClass
    })

    return NextResponse.json({
      message: 'Combined class created successfully',
      combinedClass: {
        id: combined.id,
        name: combined.name,
        isCombined: combined.isCombined,
        members: combined.combinedMembers.map(m => m.memberClass),
      },
    })
  } catch (error) {
    captureError(error, { location: 'api/classes/combine', type: 'combine-classes' })
    return NextResponse.json({ error: 'Failed to create combined class' }, { status: 500 })
  }
}

interface DeleteCombinedRequest {
  combinedClassId: number
}

/**
 * Deletes (un-combines) a combined class. Because students never moved into it,
 * this is non-destructive to rosters and grades: it removes only the combined
 * lens and the schedule artefacts attached to it. Member classes and their
 * students, usernames, memberships and grades are untouched.
 */
export async function DELETE(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const body = (await request.json()) as DeleteCombinedRequest
    const combinedClassId = body.combinedClassId

    if (!combinedClassId) {
      return NextResponse.json({ error: 'combinedClassId is required' }, { status: 400 })
    }

    const cls = await prisma.class.findUnique({
      where: { id: combinedClassId },
      select: { id: true, name: true, isCombined: true },
    })

    if (!cls) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    if (!cls.isCombined) {
      return NextResponse.json(
        { error: 'Only combined classes can be removed here' },
        { status: 400 },
      )
    }

    await prisma.$transaction(async tx => {
      // Schedule artefacts keyed by this combined class's id / name.
      await tx.teacherAssignment.deleteMany({ where: { classId: combinedClassId } })
      await tx.teacherRotation.deleteMany({ where: { classId: combinedClassId } })
      await tx.groupAssignment.deleteMany({ where: { class: cls.name } })
      await tx.studentWeekdayGroup.deleteMany({ where: { classId: combinedClassId } })
      // Schedules cascade to their turns/weeks via onDelete: Cascade.
      await tx.schedule.deleteMany({ where: { classId: combinedClassId } })
      // The class row; CombinedClassMember links cascade away with it.
      await tx.class.delete({ where: { id: combinedClassId } })
    })

    return NextResponse.json({ message: 'Combined class removed successfully' })
  } catch (error) {
    captureError(error, { location: 'api/classes/combine', type: 'delete-combined-class' })
    return NextResponse.json({ error: 'Failed to remove combined class' }, { status: 500 })
  }
}
