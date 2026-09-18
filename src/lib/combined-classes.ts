import { prisma } from '@/lib/prisma'

/**
 * Combined classes are a scheduling/grading *lens* over two or more real classes
 * (e.g. 4AHME + 4BHEM rotating together). No student ever lives directly in a
 * combined class — students stay in their member classes and directory sync only
 * ever touches those. Everything that needs "the students of this class" or "the
 * grades of this class" therefore has to expand a combined class into its member
 * classes, and every grade written while a combined class is selected has to be
 * filed under the student's own real class (their Zeugnis class), never the
 * combined lens. These helpers are the single place that logic lives.
 */

/**
 * The real class ids a class resolves to for roster and grade purposes:
 * - a normal class → `[classId]`
 * - a combined class → the ids of its member classes (never the combined id itself)
 *
 * A combined class with no members resolves to `[]` (it has no roster), which is
 * the correct, if empty, answer.
 */
export async function resolveMemberClassIds(classId: number): Promise<number[]> {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      isCombined: true,
      combinedMembers: { select: { memberClassId: true } },
    },
  })

  if (!cls) return [classId]
  if (!cls.isCombined) return [classId]
  return cls.combinedMembers.map(m => m.memberClassId)
}

/** Whether a class is a combined lens over other classes. */
export async function isCombinedClass(classId: number): Promise<boolean> {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: { isCombined: true },
  })
  return cls?.isCombined ?? false
}

/**
 * Maps each of the given students to the real class its grades must be filed
 * under when `selectedClassId` is the class the teacher is grading:
 * - normal class → every student maps to `selectedClassId`
 * - combined class → each student maps to its own member class for `schoolYearId`
 *   (resolved via ClassMembership, restricted to the combined class's members)
 *
 * A student with no membership among the member classes is omitted from the map;
 * callers must treat a missing entry as "not gradeable in this context" rather
 * than silently filing the grade under the combined lens.
 */
export async function resolveGradeClassIds(
  selectedClassId: number,
  schoolYearId: number,
  studentIds: number[],
): Promise<Map<number, number>> {
  const memberIds = await resolveMemberClassIds(selectedClassId)
  const isCombined = !(memberIds.length === 1 && memberIds[0] === selectedClassId)

  if (!isCombined) {
    return new Map(studentIds.map(id => [id, selectedClassId]))
  }

  const memberships = await prisma.classMembership.findMany({
    where: {
      studentId: { in: studentIds },
      classId: { in: memberIds },
      schoolYearId,
    },
    select: { studentId: true, classId: true },
  })

  return new Map(memberships.map(m => [m.studentId, m.classId]))
}
