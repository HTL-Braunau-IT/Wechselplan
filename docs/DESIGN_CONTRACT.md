# UI Design Contract (UX overhaul)

Every page/component refactor MUST follow these rules. This is a **presentational**
refactor: do not change data fetching, API calls, business logic, i18n keys, or
component prop contracts. Keep all `t(...)` calls and `'use client'` directives.

## 1. Colors — tokens only, never raw palette

The app uses semantic OKLCH tokens (light + dark handled automatically). **Never**
use raw Tailwind palette colors (`text-gray-500`, `bg-blue-600`, `border-slate-200`),
hex literals, or `dark:` color overrides that merely re-state the token behavior.

Map raw colors to tokens:

| Raw (remove)                                   | Token (use)                                  |
| ---------------------------------------------- | -------------------------------------------- |
| `text-gray-900 / -800`, `dark:text-white`      | `text-foreground`                            |
| `text-gray-500 / -400 / -600`                  | `text-muted-foreground`                       |
| `bg-white`, `bg-gray-50` (cards)               | `bg-card` (card) / `bg-background` (page)     |
| `bg-gray-100 / -200` (subtle fills, hovers)    | `bg-muted` / `hover:bg-accent`               |
| `border-gray-200 / -300`                       | `border` (defaults to `border-border`)        |
| `text-blue-600`, `bg-blue-600` (primary CTA)   | `text-primary` / `bg-primary text-primary-foreground` |
| `text-green-*`, `bg-green-*` (success)         | `text-success` / `bg-success` / Badge `success` or `soft-success` / Alert `variant="success"` |
| `text-red-*`, `bg-red-*` (error/danger)        | `text-destructive` / `bg-destructive` / Alert `variant="destructive"` |
| `text-amber-* / yellow-*` (warning)            | `text-warning-foreground` / Alert `variant="warning"` / Badge `warning` |

Remove now-redundant `dark:` color classes. Keep `dark:` **only** for genuine
per-theme needs (rare). Opacity modifiers on tokens are fine: `bg-primary/10`,
`border-destructive/30`.

**Do NOT touch literal colors in PDF code** (`src/components/PDFLayout.js`,
`ScheduleTurnusPDF.tsx`, `src/lib/pdf-generator.ts`) or grade-color maps in
`src/lib/grades.ts` unless told — those render outside the DOM and need literals.

## 2. Use shared components — stop hand-rolling

Prefer these over bespoke markup:

- `Button` (`@/components/ui/button`) — variants: default, secondary, outline, ghost, destructive, link; sizes: sm, default, lg, icon. Icon-only buttons need `aria-label` or `title`.
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `Badge` — default, secondary, destructive, success, warning, info, outline, soft-success, soft-warning, soft-destructive, soft-muted
- `Alert`, `AlertTitle`, `AlertDescription` — default, destructive, success, warning, info (put a lucide icon as the first child)
- `Input`, `Textarea`, `Label`, `Select` (shadcn), `Checkbox`, `Switch`, `Tabs`, `Tooltip`, `Dialog`, `AlertDialog`, `DropdownMenu`, `Table` family, `Separator`
- `Spinner` (indeterminate) / `Skeleton` + `TableSkeleton` (preferred while loading a known layout)
- `Avatar` + `initialsFrom` (`@/components/ui/avatar`) — replaces ad-hoc `<span class="rounded-full"><img/></span>`
- `PageHeader` (`@/components/ui/page-header`) — `icon`, `title`, `description`, `actions`
- `PageContainer` (`@/components/ui/page-container`) — `size`: default (max 96rem), narrow (max 4xl), wide (full)
- `EmptyState` (`@/components/ui/empty-state`) — `icon`, `title`, `description`, `action`

## 3. Page structure

- The app now has a persistent sidebar + sticky topbar (do NOT add your own top nav/header).
- Wrap each page body in `<PageContainer>` (use `size="wide"` for dense tools: schedule editor, grade grids, wide tables).
- Open content pages with `<PageHeader icon={...} title={...} description={...} actions={...} />`.
- **Remove** page-level `min-h-screen`, huge `p-24`, and centering wrappers used only for spacing. Exception: genuine full-screen splash/empty/login states may center.
- Vertical rhythm: `space-y-6` (or `space-y-8`) between major sections.

## 4. Icons (lucide-react)

Add icons where they aid scanning — page headers, primary buttons, empty states,
section titles, list-row leading icons, status. Keep sizing consistent
(`h-4 w-4` inline/buttons, `h-5 w-5` nav/headers). Don't decorate every label.

## 5. Responsive — 13" laptop → 24"+ desktop

- Mobile-first. Verify the layout at ~1280px (13") and wide.
- Wide/data-dense pages use the container's full width; put tables in
  `<div class="overflow-x-auto">` (or use the `Table` wrapper which already scrolls).
- Scale grids up on large screens: e.g. `grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`.
- Forms/reading content stay readable — cap width (`max-w-2xl`) inside the container.
- Toolbars wrap: `flex flex-wrap items-center gap-2`.
- Never cause horizontal page scroll; long content scrolls inside its own container.

## 6. Accessibility & polish

- Icon-only controls: `aria-label`/`title`. Inputs pair with `Label` (`htmlFor`).
- Interactive elements: visible focus (tokens already provide `focus-visible:ring`).
- Use `Skeleton`/`TableSkeleton` for known layouts instead of bare "Lädt…".
- Consistent radius (`rounded-lg` for cards, `rounded-md` for controls) and `shadow-sm`.

## 7. Formatting

Prettier is authoritative: single quotes, **no semicolons**, `arrowParens: avoid`,
`printWidth: 100`, trailing commas. Import alias `@/*`.
