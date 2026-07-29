/**
 * Shared design tokens for every generated PDF.
 *
 * All documents render through @react-pdf/renderer, whose default unit is the
 * PostScript point (1pt = 1/72in). A4 landscape is 841.89 x 595.28pt, A4
 * portrait 595.28 x 841.89pt — the layouts below are budgeted against those
 * numbers, so keep sizes in pt rather than mm.
 *
 * Type is IBM Plex Sans, the same family the app renders in, vendored as static
 * TTFs under `./fonts` and registered by `./register-fonts`.
 */

import { PLEX_SANS } from './register-fonts'

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

const neutralGroup: GroupColor = {
  tint: colors.surfaceSunken,
  accent: colors.muted,
  ink: colors.ink,
}

/** Group colours are keyed by the 1-based group id and wrap around safely. */
export function groupColor(groupId: number | null | undefined): GroupColor {
  if (groupId == null || !Number.isFinite(groupId) || groupId < 1) return neutralGroup
  return groupPalette[(Math.trunc(groupId) - 1) % groupPalette.length] ?? neutralGroup
}

/**
 * Type ramp, spread into a style rather than assigned to `fontFamily` — a
 * weight is two properties, not a family name:
 *
 *   headline: { ...fonts.bold, fontSize: 15 }
 */
export const fonts = {
  regular: { fontFamily: PLEX_SANS, fontWeight: 400 },
  /** Small uppercase labels; 600 holds its colour at 6–7pt where 700 blots. */
  semibold: { fontFamily: PLEX_SANS, fontWeight: 600 },
  bold: { fontFamily: PLEX_SANS, fontWeight: 700 },
  italic: { fontFamily: PLEX_SANS, fontWeight: 400, fontStyle: 'italic' },
} as const

/** A4 page boxes in pt, so layouts can budget space explicitly. */
export const page = {
  a4Landscape: { width: 841.89, height: 595.28 },
  a4Portrait: { width: 595.28, height: 841.89 },
} as const
