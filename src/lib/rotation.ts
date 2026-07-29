/**
 * Round-robin teacher rotation — the single source of truth.
 *
 * The schedule overview renders a preview of who teaches which group each turn,
 * and the "finish" step persists that same rotation. Historically each side had
 * its own copy of the round-robin maths, which could disagree when the number of
 * (unique) teachers differed from the number of groups. Both now derive from the
 * one canonical formula below.
 *
 * Canonical rule: during turn `turnIdx`, teacher `teacherIdx` teaches the group at
 * index `(teacherIdx + turnIdx) % groupCount`.
 */

/** Group index taught by `teacherIdx` during `turnIdx` (−1 when there are no groups). */
export function rotatedGroupIndex(teacherIdx: number, turnIdx: number, groupCount: number): number {
  if (groupCount <= 0) return -1
  return (teacherIdx + turnIdx) % groupCount
}

export interface GroupRotation {
  groupId: number
  /** teacherId (or null when no teacher rotates onto this group that turn) per turn. */
  turns: (number | null)[]
}

/**
 * Builds the persisted rotation payload (per group → teacherId for each turn) by
 * inverting {@link rotatedGroupIndex}, so it is guaranteed to match the preview.
 *
 * @param groups - Groups in display order.
 * @param teacherIds - Unique teacher ids in display order.
 * @param turnCount - Number of turns (turnusse).
 */
export function buildRotationForSave(
  groups: { id: number }[],
  teacherIds: number[],
  turnCount: number,
): GroupRotation[] {
  const groupCount = groups.length
  const result: GroupRotation[] = groups.map(g => ({
    groupId: g.id,
    turns: Array.from({ length: turnCount }, () => null as number | null),
  }))

  for (let turnIdx = 0; turnIdx < turnCount; turnIdx++) {
    for (let teacherIdx = 0; teacherIdx < teacherIds.length; teacherIdx++) {
      const groupIdx = rotatedGroupIndex(teacherIdx, turnIdx, groupCount)
      if (groupIdx < 0) continue
      // Later teachers overwrite earlier ones on collision (more teachers than
      // groups) — this mirrors what the preview shows for that cell.
      result[groupIdx]!.turns[turnIdx] = teacherIds[teacherIdx]!
    }
  }

  return result
}
