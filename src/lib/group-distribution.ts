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

/**
 * Reads the class a student should be grouped under. For combined classes this
 * is the student's own member class, so the distribution can keep each real
 * class in its own groups. Returning `undefined` (or the same value for every
 * student) means "one class" and falls back to plain even distribution.
 */
export type ClassKey<S> = (student: S) => string | undefined

function byLastName<S extends HasLastName>(a: S, b: S): number {
  return a.lastName.localeCompare(b.lastName)
}

/** Splits `sorted` into `n` contiguous chunks whose sizes differ by at most one. */
function chunkEvenly<S>(sorted: S[], n: number): S[][] {
  if (n <= 0) return []
  const base = Math.floor(sorted.length / n)
  const remainder = sorted.length % n
  return Array.from({ length: n }, (_, i) => {
    const size = base + (i < remainder ? 1 : 0)
    const start = i * base + Math.min(i, remainder)
    return sorted.slice(start, start + size)
  })
}

/**
 * Groups already-sorted students by class key, preserving last-name order within
 * each class and ordering the classes themselves by key for a stable layout.
 */
function bucketByClass<S>(sorted: S[], classKey: ClassKey<S>): S[][] {
  const buckets = new Map<string, S[]>()
  for (const student of sorted) {
    const key = classKey(student) ?? ''
    const bucket = buckets.get(key)
    if (bucket) bucket.push(student)
    else buckets.set(key, [student])
  }
  return [...buckets.keys()].sort((a, b) => a.localeCompare(b)).map(k => buckets.get(k)!)
}

/**
 * Decides how many groups each class gets. When there is room, every class takes
 * the fewest groups that keep it under `maxSize` (packing groups toward the cap
 * and leaving any surplus groups empty). When there are fewer groups than that
 * minimum, the remaining groups are handed out greedily to whichever class
 * currently has the largest group, so sizes stay as balanced as possible — the
 * class split is never broken to make room.
 */
function allocateGroupsPerClass(sizes: number[], numGroups: number, maxSize?: number): number[] {
  const minimal = sizes.map(n => (maxSize ? Math.max(1, Math.ceil(n / maxSize)) : 1))
  const minimalTotal = minimal.reduce((sum, n) => sum + n, 0)

  if (minimalTotal <= numGroups) return minimal

  // Under-provisioned: hand each class one group, then give the rest to the
  // class whose largest group would shrink most. Groups may exceed maxSize here
  // (the size validation surfaces that); classes are still never mixed.
  const alloc = sizes.map(() => 1)
  let remaining = numGroups - sizes.length
  while (remaining > 0) {
    let worst = 0
    for (let i = 1; i < sizes.length; i++) {
      if (sizes[i]! / alloc[i]! > sizes[worst]! / alloc[worst]!) worst = i
    }
    alloc[worst]!++
    remaining--
  }
  return alloc
}

/**
 * Distributes students across `numGroups` groups so the largest and smallest
 * differ by at most one. Always returns the unassigned group (id 0) first,
 * followed by groups numbered 1..numGroups.
 *
 * When `options.classKey` is given and the students span more than one class
 * (combined classes), the distribution stays "class-true": no group ever mixes
 * two classes. Each class is split independently into whole groups packed toward
 * `options.maxSize`, and any surplus groups are left empty. A single class falls
 * back to plain even distribution across all groups.
 */
export function distributeStudentsEvenly<S extends HasLastName>(
  students: S[],
  numGroups: number,
  options?: { classKey?: ClassKey<S>; maxSize?: number },
): GroupLike<S>[] {
  const sorted = [...students].sort(byLastName)

  if (options?.classKey) {
    const classes = bucketByClass(sorted, options.classKey)
    // Only special-case genuine multi-class rosters; one class (or fewer classes
    // than groups is impossible to honor) uses the plain even split below.
    if (classes.length > 1 && classes.length <= numGroups) {
      const perClass = allocateGroupsPerClass(
        classes.map(c => c.length),
        numGroups,
        options.maxSize,
      )
      const filled = classes.flatMap((cls, i) => chunkEvenly(cls, perClass[i]!))
      const padded = [
        ...filled,
        ...Array.from({ length: numGroups - filled.length }, () => [] as S[]),
      ]
      return [
        { id: UNASSIGNED_GROUP_ID, students: [] },
        ...padded.map((groupStudents, i) => ({ id: i + 1, students: groupStudents })),
      ]
    }
  }

  return [
    { id: UNASSIGNED_GROUP_ID, students: [] },
    ...chunkEvenly(sorted, numGroups).map((groupStudents, i) => ({
      id: i + 1,
      students: groupStudents,
    })),
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
 *
 * When `classKey` is given, redistribution stays class-true: a removed student
 * only lands in an empty group or one that already holds their class, never in a
 * group belonging to another class. If no such group has room, the student goes
 * to the unassigned tray rather than mixing classes.
 */
export function adjustGroupCount<S extends HasLastName>(
  groups: GroupLike<S>[],
  targetCount: number,
  maxSize: number,
  classKey?: ClassKey<S>,
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
      const studentClass = classKey?.(student)
      let target: (typeof keep)[number] | undefined
      for (const g of keep) {
        if (g.students.length >= maxSize) continue
        // Class-true: skip groups that already belong to a different class.
        if (
          classKey &&
          g.students.length > 0 &&
          classKey(g.students[0]!) !== studentClass
        )
          continue
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
