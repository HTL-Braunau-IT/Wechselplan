import type { CSSProperties } from 'react'

/**
 * Inline fill for a rotation-group swatch. The group number is 1–6 and maps to
 * the `--group-N-tint` / `--group-N-ink` token pair; anything out of range wraps
 * back into it rather than rendering an undefined variable.
 */
export function groupTint(groupId: number | null | undefined): CSSProperties {
  const n = groupId && groupId >= 1 ? ((groupId - 1) % 6) + 1 : 1
  return {
    background: `var(--group-${n}-tint)`,
    color: `var(--group-${n}-ink)`,
  }
}
