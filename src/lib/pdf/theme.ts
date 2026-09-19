/**
 * Shared design tokens for every generated PDF.
 *
 * Colours and page geometry live in `./palette` (renderer-free, so the browser
 * can import them too — see the Klassenliste preview). This module re-exports
 * them and adds the font ramp, which pulls in `@react-pdf/renderer` via
 * `./register-fonts`, so PDF-only code keeps importing from here.
 *
 * The renderer's default unit is the PostScript point (1pt = 1/72in); keep sizes
 * in pt rather than mm.
 */

import { PLEX_SANS } from './register-fonts'

export { colors, groupPalette, groupColor, neutralGroup, page } from './palette'
export type { GroupColor } from './palette'

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
