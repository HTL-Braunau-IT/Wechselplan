import { join } from 'node:path'
import { Font } from '@react-pdf/renderer'

/**
 * Registers IBM Plex Sans for every generated PDF — the same family the app
 * itself renders in, so a printed plan and the screen it came from match.
 *
 * The files are static instances, not the variable font: react-pdf never sets
 * a weight axis, so a variable TTF would render every weight as Regular.
 *
 * They are read from disk at runtime through a computed path, which Next's
 * output tracing cannot see — `outputFileTracingIncludes` in `next.config.js`
 * names this directory for each route that renders a PDF. Forget that and the
 * standalone build throws ENOENT on the first export.
 */
const FONT_DIR = join(process.cwd(), 'src', 'lib', 'pdf', 'fonts')

export const PLEX_SANS = 'IBM Plex Sans'

let registered = false

/** Idempotent: react-pdf keeps one global font store per process. */
export function registerPdfFonts(): void {
  if (registered) return
  registered = true

  Font.register({
    family: PLEX_SANS,
    fonts: [
      { src: join(FONT_DIR, 'IBMPlexSans-Regular.ttf'), fontWeight: 400 },
      { src: join(FONT_DIR, 'IBMPlexSans-SemiBold.ttf'), fontWeight: 600 },
      { src: join(FONT_DIR, 'IBMPlexSans-Bold.ttf'), fontWeight: 700 },
      { src: join(FONT_DIR, 'IBMPlexSans-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
    ],
  })
}
