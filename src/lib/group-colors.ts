/**
 * Rotation-group tint classes.
 *
 * A Wechselplan splits a class into 2–6 numbered groups that rotate through
 * workshops; the group number is the single most-repeated datum in the product
 * and carries a fixed colour everywhere it appears (column headers, rotation
 * cells, group pills). Group/grade tints are the one place the design contract
 * allows raw palette colours, because they are a meaning-bearing colour system
 * rather than a restated token — and because the same plans are photocopied in
 * black and white, the group number is always shown inside its swatch, never
 * colour alone.
 *
 * Order matches the design system: 1 amber · 2 emerald · 3 sky · 4 rose ·
 * 5 violet · 6 cyan.
 */
export const GROUP_COLORS = [
  'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100',
  'bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100',
  'bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-100',
  'bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-100',
  'bg-violet-100 text-violet-900 dark:bg-violet-400/15 dark:text-violet-100',
  'bg-cyan-100 text-cyan-900 dark:bg-cyan-400/15 dark:text-cyan-100',
] as const

/** Tint classes for a zero-based group index, wrapping past the palette length. */
export const groupColor = (idx: number) => GROUP_COLORS[idx % GROUP_COLORS.length]
