/**
 * Pure helpers for the student-group editor on the schedule "class" step.
 *
 * These were previously inlined across several overlapping effects in the page
 * component, which made the group renumbering/redistribution logic hard to reason
 * about. Extracting them here keeps the transforms pure and unit-testable; the
 * component just wires them to state.
 */

export const UNASSIGNED_GROUP_ID = 0

export interface GroupLike<S> {
  id: number
  students: S[]
}

type HasLastName = { lastName: string }

function byLastName<S extends HasLastName>(a: S, b: S): number {
  return a.lastName.localeCompare(b.lastName)
}

/**
 * Distributes students across `numGroups` groups so the largest and smallest
 * differ by at most one. Always returns the unassigned group (id 0) first,
 * followed by groups numbered 1..numGroups.
 */
export function distributeStudentsEvenly<S extends HasLastName>(
  students: S[],
  numGroups: number,
): GroupLike<S>[] {
  const sorted = [...students].sort(byLastName)
  const base = Math.floor(sorted.length / numGroups)
  const remainder = sorted.length % numGroups

  return [
    { id: UNASSIGNED_GROUP_ID, students: [] },
    ...Array.from({ length: numGroups }, (_, i) => {
      const size = base + (i < remainder ? 1 : 0)
      const start = i * base + Math.min(i, remainder)
      return { id: i + 1, students: sorted.slice(start, start + size) }
    }),
  ]
}

/** True when every regular group is within `maxSize` (the unassigned group is exempt). */
export function checkGroupSizes<S>(groups: GroupLike<S>[], maxSize: number): boolean {
  return groups.every(g => g.id === UNASSIGNED_GROUP_ID || g.students.length <= maxSize)
}

/** Ensures the unassigned group (id 0) is present, prepending it when missing. */
export function ensureUnassignedGroup<S>(groups: GroupLike<S>[]): GroupLike<S>[] {
  if (groups.some(g => g.id === UNASSIGNED_GROUP_ID)) return groups
  return [{ id: UNASSIGNED_GROUP_ID, students: [] }, ...groups]
}

function splitGroups<S>(groups: GroupLike<S>[]): {
  unassigned: GroupLike<S>
  regular: GroupLike<S>[]
} {
  const unassigned = groups.find(g => g.id === UNASSIGNED_GROUP_ID) ?? {
    id: UNASSIGNED_GROUP_ID,
    students: [] as S[],
  }
  const regular = groups.filter(g => g.id !== UNASSIGNED_GROUP_ID)
  return { unassigned, regular }
}

/**
 * Grows or shrinks the number of regular groups to `targetCount`, preserving
 * existing assignments.
 *
 * - Growing appends empty groups.
 * - Shrinking redistributes students from removed groups into remaining groups
 *   that still have room (kept sorted by last name); any that don't fit go to the
 *   unassigned group.
 */
export function adjustGroupCount<S extends HasLastName>(
  groups: GroupLike<S>[],
  targetCount: number,
  maxSize: number,
): GroupLike<S>[] {
  const { unassigned, regular } = splitGroups(groups)
  const currentCount = regular.length

  if (targetCount > currentCount) {
    const grown = [
      ...regular.map(g => ({ ...g, students: [...g.students] })),
      ...Array.from({ length: targetCount - currentCount }, (_, i) => ({
        id: currentCount + i + 1,
        students: [] as S[],
      })),
    ]
    return [{ ...unassigned, students: [...unassigned.students] }, ...grown]
  }

  if (targetCount < currentCount) {
    const keep = regular.slice(0, targetCount).map(g => ({ ...g, students: [...g.students] }))
    const removed = regular.slice(targetCount).flatMap(g => g.students)
    const overflow: S[] = []

    for (const student of removed) {
      // Add each removed student to the currently-smallest eligible group, not
      // the first with any room — otherwise shrinking fills group 1 to maxSize
      // before touching the rest, producing lopsided groups (finding 23). This
      // keeps largest-minus-smallest <= 1, matching distributeStudentsEvenly.
      let target: (typeof keep)[number] | undefined
      for (const g of keep) {
        if (g.students.length >= maxSize) continue
        if (!target || g.students.length < target.students.length) target = g
      }
      if (target) {
        target.students.push(student)
        target.students.sort(byLastName)
      } else {
        overflow.push(student)
      }
    }

    const updatedUnassigned = {
      ...unassigned,
      students: [...unassigned.students, ...overflow].sort(byLastName),
    }
    return [updatedUnassigned, ...keep]
  }

  return groups
}

/**
 * Renumbers regular groups to 1..targetCount when they are out of sequence or the
 * count changed. Returns the same reference when no renumbering is needed.
 */
export function renumberGroups<S>(groups: GroupLike<S>[], targetCount: number): GroupLike<S>[] {
  const { unassigned, regular } = splitGroups(groups)
  const sorted = [...regular].sort((a, b) => a.id - b.id)

  const needsRenumber =
    sorted.some((g, i) => g.id !== i + 1) || sorted.length !== targetCount

  if (!needsRenumber) return groups

  return [
    unassigned,
    ...sorted.slice(0, targetCount).map((g, i) => ({ ...g, id: i + 1 })),
  ]
}
