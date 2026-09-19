/**
 * PDF colour + geometry tokens, kept free of any `@react-pdf/renderer` import so
 * the values can also be used in the browser (e.g. the Klassenliste preview,
 * which mirrors the printed sheet pixel-for-pixel).
 *
 * `theme.ts` re-exports everything here and adds the font ramp, which *does* pull
 * in the renderer — so server PDF code keeps importing from `theme`, while client
 * code imports the palette directly.
 *
 * The renderer's default unit is the PostScript point (1pt = 1/72in). A4 portrait
 * is 595.28 x 841.89pt; keep sizes in pt.
 */

export const colors = {
  ink: '#0F172A',
  inkSoft: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',

  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  surfaceSunken: '#F1F5F9',

  line: '#D8DEE8',
  lineStrong: '#94A3B8',

  brand: '#1D4ED8',
  brandInk: '#1E3A8A',
  brandTint: '#EFF6FF',

  warnTint: '#FEF9C3',
  warnInk: '#854D0E',
  danger: '#BE123C',
} as const

/**
 * Per-group colours. `tint` fills whole cells, `accent` carries the group pill,
 * `ink` is the text drawn on `tint`. The group number is always printed inside
 * the swatch, so the plan stays readable when photocopied in black and white.
 */
export interface GroupColor {
  tint: string
  accent: string
  ink: string
}

export const groupPalette: readonly GroupColor[] = [
  { tint: '#FEF3C7', accent: '#B45309', ink: '#78350F' }, // 1 — amber
  { tint: '#D1FAE5', accent: '#047857', ink: '#064E3B' }, // 2 — emerald
  { tint: '#DBEAFE', accent: '#1D4ED8', ink: '#1E3A8A' }, // 3 — blue
  { tint: '#FFE4E6', accent: '#BE123C', ink: '#881337' }, // 4 — rose
  { tint: '#EDE9FE', accent: '#6D28D9', ink: '#4C1D95' }, // 5 — violet
  { tint: '#CFFAFE', accent: '#0E7490', ink: '#164E63' }, // 6 — cyan
]

/** The neutral swatch for unassigned students (group id 0 / null). */
export const neutralGroup: GroupColor = {
  tint: colors.surfaceSunken,
  accent: colors.muted,
  ink: colors.ink,
}

/** Group colours are keyed by the 1-based group id and wrap around safely. */
export function groupColor(groupId: number | null | undefined): GroupColor {
  if (groupId == null || !Number.isFinite(groupId) || groupId < 1) return neutralGroup
  return groupPalette[(Math.trunc(groupId) - 1) % groupPalette.length] ?? neutralGroup
}

/** A4 page boxes in pt, so layouts can budget space explicitly. */
export const page = {
  a4Landscape: { width: 841.89, height: 595.28 },
  a4Portrait: { width: 595.28, height: 841.89 },
} as const
