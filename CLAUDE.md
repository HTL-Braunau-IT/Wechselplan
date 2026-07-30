# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Wechselplan is a school administration app for an Austrian technical school (HTL). It manages class schedules with rotating student groups ("Wechselplan" = rotation plan), student/teacher rosters synced from a directory, and grade collection (Notensammler / Noten). UI text and domain terms are German; grading follows Austrian rules (see `src/lib/grades.ts` — grades 6 "nicht beurteilt" and 7 "gestunden" are sentinels, never averaged).

## Commands

```bash
npm run dev              # Next.js dev server (Turbopack)
npm run check            # eslint + tsc --noEmit — the primary gate, run before committing
npm run typecheck        # tsc --noEmit alone
npm run lint             # eslint alone (lint:fix to autofix)
npm run format:write     # prettier write (format:check to verify)
npm run test             # vitest (watch); `npx vitest run` for one shot
npm run test -- path/to/file.test.ts   # single test file
npx vitest run -t "name"                # single test by name
npm run build            # next build (production)
```

Database (Prisma / PostgreSQL):

```bash
npm run db:generate      # prisma migrate dev — create+apply a migration in dev
npm run db:migrate       # prisma migrate deploy — apply migrations (prod)
npm run db:push          # push schema without a migration
npm run db:seed          # seed reference data (holidays, times, rooms, subjects) — no people
npm run db:seed:local    # LOCAL ONLY: teachers, classes, students, rotations, schedules
npm run db:seed:local -- --reset   # delete those fixtures first, then recreate
npm run db:studio        # Prisma Studio
```

`db:seed` deliberately creates no people — in a real deployment teachers, classes and students arrive from Entra — which leaves a freshly migrated local database with nothing to click on. `scripts/seed-local-fixtures.ts` fills that gap and is **never** wired into `db:seed` or `prisma.seed`. It refuses to run unless all three hold: `NODE_ENV !== 'production'`, `DATABASE_URL` resolves to a local host, and the database contains no directory-synced teachers. Its rows are tagged `externalSource = 'local-fixture'`, which is what makes `--reset` able to delete exactly what it created.

Browser-driven checks (Playwright, `e2e/`):

```bash
npm run e2e              # playwright test (starts `npm run dev` if nothing is on :3000)
npm run e2e:ui           # interactive runner
npm run e2e:session -- --username max.mustermann --role admin --curl
```

**Sign-in is not scripted, and must not be.** Entra is the only provider and its OAuth redirect cannot be automated. Because the session strategy is `jwt`, both enforcement layers read identity purely from the session cookie (`middleware.ts` via `getToken`, handlers via `getServerSession`) and neither calls Microsoft — so `e2e/global-setup.ts` encrypts a token with the local `NEXTAUTH_SECRET` and writes it as Playwright `storageState`. `src/lib/auth.ts` is untouched by any of this; there is no dev-login provider that could reach production.

Three things the minted token has to get right, all enforced in `e2e/session.ts`:

- `provider: 'azure-ad'`, or the `jwt` callback treats it as a stale LDAP token and strips the role to `user`.
- `name` must match a real `Teacher.username` — it is the key `/api/teachers/by-username` is queried with, so an invented name signs in fine and then renders empty class lists. Global setup picks an active teacher from the DB when `E2E_USERNAME` is unset.
- A non-empty `ENTRA_TEACHER_GROUP_ID` in `.env`, even a bogus one. Past the 15-minute refresh window the callback re-resolves the role via Graph; with a group configured the call throws and the `catch` preserves the role, but with _nothing_ configured `resolveMicrosoftAccess` returns `role: 'user'` without throwing and silently demotes the session.

Harness knobs (not app env, not in `src/env.js`): `E2E_BASE_URL`, `E2E_ROLE`, `E2E_USERNAME`.

CI (`.github/workflows/node.js.yaml`) runs typecheck → vitest → lint on the standard runner, plus a separate Alpine Docker build. All must pass. CI sets `SKIP_ENV_VALIDATION=true`. Playwright is not wired into CI — it is a local driving tool.

## Architecture

**Stack:** Next.js 15 App Router + React 19, Prisma (PostgreSQL), NextAuth, Tailwind v4, shadcn/Radix UI, React Query, i18next. Scaffolded from create-t3-app.

**tRPC is scaffolded but unused.** `src/server/api/root.ts` is an empty router. All server logic lives in **REST route handlers under `src/app/api/**/route.ts`**. Do not add tRPC procedures — follow the existing REST pattern. The client calls these via `fetch`(often wrapped in hooks under`src/hooks/`).

**Authentication & authorization** is the most important cross-cutting concern:

- Two NextAuth providers, each toggled by env (`AUTH_LDAP_ENABLED`, `AUTH_MS_ENABLED`): LDAP credentials and Azure AD / Entra. See `src/lib/auth.ts`. Roles are `admin | teacher | student | user` (note `staff` below is an access _tier_, satisfied by teacher-or-admin, not a role); Entra roles are re-resolved on a timer (app-only Graph call, `resolveMicrosoftAccess`) so removed users lose access within ~15 min rather than at JWT expiry.
- **Access tiers** (`public | session | staff | admin`) are defined in one table: `src/lib/api-access.ts` (`API_ACCESS_RULES`, most-specific-prefix-first). Unmatched routes default to `staff` — new routes are protected by default.
- **Two enforcement layers, both driven by that table:** (1) `src/middleware.ts` checks every `/api/*` request at the edge; (2) route handlers wrap themselves with `withSession` / `withStaff` / `withAdmin` or call `denyUnlessAccess(tier)` from `src/lib/api-guard.ts` (defence in depth — middleware is easy to mis-scope). When adding a route, update the rule table AND add a handler guard.
- Note some endpoints under `/api/admin/settings` and `/api/admin/grades` are deliberately `staff`, not `admin`, because they're used during schedule creation.

**Data model** (`prisma/schema.prisma`): Students/Teachers/Classes carry `externalId`/`externalSource`/`isActive`/`lastSyncedAt` for directory sync (soft-deactivate, never hard-delete synced entities). Key relations: a `Schedule` has normalized `ScheduleTurn`/`ScheduleWeek` rows (the legacy `scheduleData` JSON blob is deprecated and null — see `refactor_progress.md` / `docs/MIGRATION_GUIDE.md`). `Student.groupId` is the source of truth for group membership; `GroupAssignment` is a denormalized cache kept in sync by app logic (see `docs/ARCHITECTURE.md`). Grades live in `Grade`/`FinalGrade`/`NotenEntry`; `SchoolYear` scopes most records by year with a semester change date.

**Feature domains:**

- **Schedule** (`src/app/schedules`, `src/components/schedule`, `src/hooks/use-schedule-*`): create rotation plans, assign student groups and teachers, generate PDFs.
- **Notensammler & Noten** (`src/app/notensammler`, `src/app/noten`, `src/lib/grades.ts`): grade entry/collection. These were recently split out of "god components" (commit b10f587) — keep logic factored, shared rules in `src/lib/grades.ts`.
- **Notifications** (`src/lib/notifications.ts`, `src/types/notifications.ts`, `src/app/api/notifications`, `src/components/notification-bell.tsx`): the in-app bell. Rows store a `type` plus interpolation `params`, never rendered text — the message lives in the i18next catalogue, so an old notification still renders in both languages, and `src/types/__tests__/notifications.test.ts` fails if a type has no message. Writers call `notifyQuietly` / the `_notify.ts` helpers beside each route: emission is best-effort and must never fail the save that caused it. The actor is never notified, deactivated teachers are dropped, and a `dedupeKey` collapses repeat events onto the recipient's existing _unread_ row. See `docs/API/notifications/README.md`.
- **Directory sync** (`src/lib/directory-sync.ts`, `teacher-sync.ts`, `class-student-sync.ts`, `src/app/api/sync/run`): pulls users/classes from LDAP or Entra. The unattended `/api/sync/run` endpoint authenticates via a shared-secret header, not a session.
- **Notenmanagement integration** (`src/lib/notenmanagement/`, `src/app/api/noten*/`): pushes reviewed Endnoten (`FinalGrade`) into an external Notenmanagement system. `server-client.ts` is the single server-side HTTP entry point (token + LF read/write); the browser only calls our own routes. Students are linked to their NM Matrikelnummer **once** by the link sync (`link-sync.ts`), which matches `Student.sokratesId` (Entra `employeeId`) against NM `Student_ID` — no per-transfer name matching. The service account for that sync lives (encrypted, `src/lib/crypto.ts`) in `NotenmanagementSettings`, editable under Admin → Notenmanagement; the actual grade write still authenticates as the individual teacher so LFs are attributed to them.
- **Entitlements/licensing** (`src/lib/entitlements.ts`, `src/types/entitlements.ts`): premium features gated by an external license server, cached. Server-only — clients read `GET /api/entitlements` via `EntitlementsContext`. `DISABLE_ENTITLEMENTS=true` enables everything locally.

**PDF generation** is entirely `@react-pdf/renderer` — jsPDF, jspdf-autotable and pdfkit were removed. Documents are React components under `src/components/pdf/` (plus `src/components/ScheduleTurnusPDF.tsx`), share their tokens through `src/lib/pdf/theme.ts`, and are turned into a Buffer by `renderPdfToBuffer` (`src/lib/pdf/render.ts` — `toBuffer()` hands back a stream, which must be drained before it can be a response body). `src/lib/pdf-generator.ts` is a thin wrapper the route handlers call.

Type is **IBM Plex Sans**, the same family the app renders in. The PDFs use static TTFs vendored under `src/lib/pdf/fonts/` (a variable font is useless here — react-pdf never sets a weight axis, so every weight would come out Regular); `src/lib/pdf/register-fonts.ts` registers them and `renderPdfToBuffer` calls it. They are read through a computed path, so each PDF route is named in `outputFileTracingIncludes` — miss that and the standalone build throws ENOENT on the first export. The browser gets the same family from `@fontsource-variable/ibm-plex-sans` (imported in `src/app/globals.css`), self-hosted out of node_modules: no Google Fonts CDN request, which matters both offline and for GDPR.

Sizes are in pt, budgeted against A4 landscape (841.89 × 595.28) for the worst case the school actually hits — 4 groups of 12 students, 4 AM + 4 PM teachers, 8 turnus columns, which fits one sheet. Plex is a little wider and taller than the metrics the layouts were first tuned to, so a font change is not free: re-check the page counts. Preview any change without a database or a login:

```bash
npm run pdf:preview           # renders all four documents to .pdf-preview/
npm run pdf:preview -- /tmp/x # somewhere else
```

Fixtures live in `scripts/preview-pdfs.ts`; it runs against `tsconfig.scripts.json` because tsx cannot emit the repo's `jsx: preserve`.

**Env vars** are validated by `src/env.js` (`@t3-oss/env-nextjs` + zod). Add new server/client vars there and to `runtimeEnv`. `.env.example` documents them.

## Conventions

- **Formatting is enforced by `prettier.config.js`, which was measured against the existing code — treat it as authoritative:** single quotes, **no semicolons**, `arrowParens: avoid`, `printWidth: 100`, trailing commas. (The aspirational `.cursor/rules/basics.mdc` disagrees on some points — tabs, 80 cols, mentions Redux — and predates the current setup. Follow prettier and the actual code, not that file.)
- Import alias: `@/*` → `src/*` (tsconfig). Some older code also uses `~/*`; vitest aliases both.
- TypeScript is strict with `noUncheckedIndexedAccess` and `checkJs`.
- **Tests:** vitest. Route/lib tests run in `node`; component tests opt into jsdom with a `// @vitest-environment jsdom` docblock. `vitest.setup.ts` globally mocks `@/lib/api-guard` to "allowed" so handler tests exercise logic, not auth — the auth policy itself is tested in `src/lib/__tests__/api-access.test.ts` and `src/app/api/__tests__/route-guards.test.ts` (which asserts every handler is wired to the policy). Opt back into the real guard with `vi.unmock('@/lib/api-guard')`.
- API endpoint docs live under `docs/API/` (mirrors the route tree); update them when changing an endpoint's contract.
