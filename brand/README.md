# Wechselplan brand marks

> **Selected: Pack C · Monogram** — now live as the browser favicon
> (`src/app/icon.svg`), the sidebar mark (`src/components/layout/app-sidebar.tsx`),
> and the shared PDF header (`BrandMark` in `src/components/pdf/primitives.tsx`).
> Packs A and B are kept here as alternates.

Three candidate logo/icon packs. Each is built from the app's own tokens
(`src/lib/pdf/theme.ts`): brand blue `#1D4ED8`, ink `#1E3A8A`, the four group
colours (amber/emerald/blue/rose) and IBM Plex Sans. Everything is SVG, so it
scales cleanly for a 16 px favicon and an A4 PDF header alike.

## The packs

| Pack | Idea | Reads best |
|------|------|-----------|
| **A · Orbit** | Four coloured arcs form a broken ring — the student groups rotating through the plan. | Colourful, playful, unmistakably "rotation". |
| **B · Raster** | The schedule grid, its four cells in the group palette. | Literal and calm; the four-colour tile is a strong favicon. |
| **C · Monogram** | A two-tone **W** from two interlocking chevrons — *Wechsel* = exchange. | Most compact/serious; a classic app-icon look. |

## Files per pack

- `icon.svg` — full-colour app mark, transparent background (headers, about screens).
- `favicon.svg` — the mark on a rounded brand-blue tile, tuned to stay legible at 16 px.
- `icon-mono.svg` — single-colour, uses `currentColor`; drop into PDFs and print (set `color`/`fill`).
- `wordmark.svg` — horizontal lockup with the "Wechsel**plan**" logotype.

## Using them

**Favicon / app metadata** (`src/app/layout.tsx`): copy the chosen `favicon.svg`
to `src/app/icon.svg` — Next.js App Router serves it automatically, no `<link>`
needed. Add `apple-icon.svg` the same way if you want a home-screen icon.

**App header:** import `icon.svg` (or `wordmark.svg`) as a React component or
`<img>`; it inherits size from its box.

**PDF header:** `icon-mono.svg` uses `currentColor`, so react-pdf's `<Svg>`/`Path`
can render it in `colors.brandInk` or `colors.ink` — matches the existing PDF
design system in `src/lib/pdf/theme.ts`.

Preview any file directly in a browser, or open `brand/preview.html`.
