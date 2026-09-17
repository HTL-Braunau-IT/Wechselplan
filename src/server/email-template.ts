/**
 * Branded HTML shell for every transactional e-mail Wechselplan sends.
 *
 * The markup mirrors the app's own look — IBM Plex Sans, the blue `--primary`
 * (#1D4ED8), the W monogram, 10-ish-px radii, the same ink/muted/line greys — but
 * it is written for e-mail, not the browser: one 600px `<table>`, everything
 * inline-styled, no external CSS, no web font request (clients fall back to the
 * system stack), no SVG (the logo is a CSS tile so Gmail/Outlook render it too).
 *
 * The colour values are the PDF theme's (`src/lib/pdf/theme.ts`) — the shared
 * source of truth for the brand — restated here as literals because a mail body
 * is assembled far from Tailwind and its oklch tokens.
 *
 * Everything dynamic MUST pass through {@link esc}; several callers forward
 * user-typed text (names, class names, a support message) straight into the body.
 */

/** Brand palette, hex — kept in lockstep with `src/lib/pdf/theme.ts`. */
const c = {
  ink: '#0F172A',
  inkSoft: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  surfaceSunken: '#F1F5F9',
  line: '#D8DEE8',
  lineSoft: '#EEF2F7',
  brand: '#1D4ED8',
  brandInk: '#1E3A8A',
  brandTint: '#EFF6FF',
  gold: '#FBBF24',
  successInk: '#047857',
  successTint: '#ECFDF5',
  successLine: '#D1FAE5',
  warnInk: '#854D0E',
  warnTint: '#FEF9C3',
  warnLine: '#FDE68A',
  dangerInk: '#BE123C',
  dangerTint: '#FFF1F2',
  dangerLine: '#FFE4E6',
} as const

/** System-safe stack; the app's Plex is tried first for clients that have it. */
const FONT =
  "'IBM Plex Sans','IBM Plex Sans Variable',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/** HTML-escape any dynamic value before it enters the markup. */
export function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The app origin, from NextAuth's configured URL; null when unset. */
export function appBaseUrl(): string | null {
  const raw = process.env.NEXTAUTH_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/+$/, '')
}

/**
 * Turns an app path (or an already-absolute URL) into a link an e-mail client can
 * follow. Returns null when there is no base to resolve a relative path against,
 * so callers can drop a would-be-broken button rather than ship a dead link.
 */
export function absoluteUrl(pathOrUrl: string): string | null {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const base = appBaseUrl()
  if (!base) return null
  return `${base}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

export interface EmailButton {
  label: string
  href: string
}

type PanelTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface EmailPanel {
  tone?: PanelTone
  /** Optional small heading above the items. Plain text — escaped for you. */
  title?: string
  /**
   * One entry per row. Each string is trusted HTML: build it with {@link esc}
   * around the dynamic parts and {@link muted} for secondary detail.
   */
  itemsHtml?: string[]
  /** Free-form escaped HTML instead of a bullet list (e.g. a support message). */
  bodyHtml?: string
}

export interface EmailContent {
  /** Hidden inbox-preview line. Plain text — escaped for you. */
  preheader?: string
  /** The H1. Plain text — escaped for you. */
  title: string
  /** Lead paragraphs. Plain text — escaped for you. */
  intro?: string[]
  panel?: EmailPanel
  button?: EmailButton | null
  /** Paragraphs after the panel/button. Plain text — escaped for you. */
  outro?: string[]
}

const panelTone: Record<PanelTone, { tint: string; line: string; dot: string }> = {
  neutral: { tint: c.surfaceAlt, line: c.lineSoft, dot: c.muted },
  info: { tint: c.brandTint, line: '#DBEAFE', dot: c.brand },
  success: { tint: c.successTint, line: c.successLine, dot: c.successInk },
  warning: { tint: c.warnTint, line: c.warnLine, dot: c.warnInk },
  danger: { tint: c.dangerTint, line: c.dangerLine, dot: c.dangerInk },
}

/** Wrap secondary detail in the muted ink — for use inside `itemsHtml`. */
export const muted = (text: string): string => `<span style="color:${c.muted};">${esc(text)}</span>`

/** A full-width table row with the standard 32px side gutter. */
const row = (inner: string, pad = `6px 32px`): string =>
  `<tr><td style="padding:${pad};">${inner}</td></tr>`

const paragraph = (text: string): string =>
  `<p style="margin:0 0 4px 0;font:400 15px/1.65 ${FONT};color:${c.inkSoft};">${esc(text).replace(
    /\n/g,
    '<br />',
  )}</p>`

const renderButton = ({ label, href }: EmailButton): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" bgcolor="${c.brand}" style="border-radius:9px;background:${c.brand};">
        <a href="${esc(href)}" target="_blank" rel="noopener noreferrer"
           style="display:inline-block;padding:12px 24px;font:600 15px/1 ${FONT};color:#FFFFFF;text-decoration:none;border-radius:9px;">
          ${esc(label)}&nbsp;&rarr;
        </a>
      </td>
    </tr></table>`

const renderPanel = (panel: EmailPanel): string => {
  const tone = panelTone[panel.tone ?? 'neutral']
  const heading = panel.title
    ? `<div style="margin:0 0 10px 0;font:600 12px/1.4 ${FONT};letter-spacing:.04em;text-transform:uppercase;color:${c.muted};">${esc(
        panel.title,
      )}</div>`
    : ''

  let inner = panel.bodyHtml ?? ''
  if (panel.itemsHtml?.length) {
    const items = panel.itemsHtml
      .map(
        (item, i) =>
          `<tr><td style="padding:${i === 0 ? '0' : '8px'} 0 0 0;font:400 14px/1.55 ${FONT};color:${c.ink};">
             <span style="color:${tone.dot};font-weight:700;">•</span>&nbsp;${item}
           </td></tr>`,
      )
      .join('')
    inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>`
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:${tone.tint};border:1px solid ${tone.line};border-radius:10px;">
      <tr><td style="padding:16px 18px;">${heading}${inner}</td></tr>
    </table>`
}

/** Render the full HTML document for a transactional e-mail. */
export function renderEmailHtml(content: EmailContent): string {
  const rows: string[] = []

  rows.push(
    row(
      `<h1 style="margin:6px 0 12px 0;font:700 22px/1.3 ${FONT};color:${c.ink};letter-spacing:-.01em;">${esc(
        content.title,
      )}</h1>`,
      '8px 32px 0 32px',
    ),
  )

  for (const p of content.intro ?? []) rows.push(row(paragraph(p)))

  if (content.panel) rows.push(row(renderPanel(content.panel), '14px 32px'))

  if (content.button) rows.push(row(renderButton(content.button), '18px 32px 6px 32px'))

  for (const p of content.outro ?? []) rows.push(row(paragraph(p)))

  const preheader = content.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;">${esc(
        content.preheader,
      )}</div>`
    : ''

  // The logo tile: a blue rounded square with a white "W" and the gold accent
  // dot from the real monogram, built from a table cell so every client draws it.
  const logo = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="40" height="40" align="center" valign="middle"
          style="width:40px;height:40px;background:${c.brand};border-radius:11px;
                 font:700 20px/40px ${FONT};color:#FFFFFF;text-align:center;">
        W<span style="color:${c.gold};">.</span>
      </td>
      <td style="padding-left:12px;font:600 18px/1.2 ${FONT};color:${c.ink};letter-spacing:-.01em;">
        Wechselplan
      </td>
    </tr></table>`

  return `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${esc(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:${c.surfaceSunken};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.surfaceSunken};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:600px;background:${c.surface};border:1px solid ${c.line};border-radius:14px;overflow:hidden;">
        <tr><td style="height:4px;line-height:4px;font-size:4px;background:${c.brand};">&nbsp;</td></tr>
        <tr><td style="padding:24px 32px 4px 32px;">${logo}</td></tr>
        ${rows.join('\n        ')}
        <tr><td style="padding:22px 32px 28px 32px;border-top:1px solid ${c.lineSoft};">
          <p style="margin:0;font:400 12px/1.6 ${FONT};color:${c.faint};">
            Diese Nachricht wurde automatisch von Wechselplan gesendet.
          </p>
        </td></tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr><td style="padding:16px 8px;text-align:center;font:400 11px/1.5 ${FONT};color:${c.faint};">
          Wechselplan &middot; Schulverwaltung
        </td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}
