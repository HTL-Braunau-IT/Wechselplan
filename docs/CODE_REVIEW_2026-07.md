# Code Review — Wechselplan (2026-07)

Scope of this review:

1. General code review / security audit of the app as it stands
2. UI: what can be **standardised and reused** (plus a light modernisation pass)
3. What is still missing to move from **LDAP** to **Microsoft 365 / Entra** for user sync and login

Baseline: `main` @ `1f59818`. `npx tsc --noEmit` is clean (only a `baseUrl` deprecation warning from TS).

---

## 0. Executive summary

The Entra migration is **much further along than `.cursor/plans/entra-migration-progress.md` claims** — that
plan file still lists every phase as `todo`, but Phases 1–5 are largely implemented in code (Graph client,
mapper, diff/apply sync engine for teachers *and* classes/students, soft-delete lifecycle, admin
preview/apply dialogs, settings UI). The plan file is stale and misleading; it should be updated first so
nobody re-implements finished work.

What is genuinely still open on the M365 side is smaller but important: the **login path** still reads its
allow-list from env instead of the DB, uses a Graph call that the requested OAuth scopes probably do not
cover, and there is **no nightly sync worker at all** despite the `hybrid` / `nightly_only` setting existing
end-to-end. See §3.

The most urgent issue in the whole repo is unrelated to Entra: **almost every API route is completely
unauthenticated**, and two of them leak the Active Directory bind password to anonymous callers. See §1.1.

On the UI side there is a lot of copy-paste that can be collapsed: ~1,400 lines of near-identical admin tab
files, two sync dialogs that duplicate the same state machine and table primitives, 44 files doing hand-rolled
`fetch` while a React Query setup already exists, two toast libraries, two path aliases, and German/English
mixed inside single components. See §2.

Severity legend: **[S1]** exploitable / data-loss · **[S2]** functional bug · **[S3]** maintainability

---

## 1. Code review

### 1.1 [S1] The API surface is unauthenticated

`src/middleware.ts:97-102` matches `'/((?!_next|api|favicon.ico).*)'` — **`/api` is explicitly excluded**.
Middleware therefore protects *pages only*. Route handlers must do their own auth, and 55 of them do not:

```
src/app/api/admin/data/route.ts          ← generic CRUD over 18 Prisma models
src/app/api/admin/ldap-config/route.ts
src/app/api/auth/ldap-config/route.ts
src/app/api/admin/settings/{import,break-times,schedule-times}/route.ts
src/app/api/students/**, /api/teachers/**, /api/classes/**, /api/schedules/**,
/api/export/**, /api/settings/**, /api/roles, /api/subjects, /api/rooms, ...
```

`/api/admin/data` alone is a generic `GET/POST/PUT/DELETE` over `student`, `teacher`, `class`, `role`,
`userRole`, `supportMessage`, … with no session check. An anonymous `DELETE /api/admin/data?model=student&id=1`
deletes a student.

Only the newer Entra endpoints are correct — `class-sync/{preview,apply}`, `teachers/sync/{preview,apply}`,
`entra/groups`, `directory-sync-settings`, `{student,teacher}-photos/o365-refresh` all call `requireAdmin()`.
That is the pattern to propagate.

**Worst case:** `GET /api/auth/ldap-config` and `GET /api/admin/ldap-config` return
`LDAP_PASSWORD` — the AD service-account bind password — in plaintext JSON, to anyone. `POST` on the same two
routes writes attacker-controlled content into the server's `.env` file on disk. `src/app/api/auth/ldap-config/route.ts`
is worse than its sibling: its POST round-trips *every* existing `.env` line through a `Map`, so a single call
also silently rewrites `NEXTAUTH_SECRET`, `ENTRA_CLIENT_SECRET`, `DATABASE_URL` etc. (reordering them, and
dropping comments and blank lines).

Recommended fix, in order:

1. **Delete both `ldap-config` routes and the orphaned UI behind them** (see §2.7 — the page that used them no
   longer exists). Writing runtime secrets into `.env` from an HTTP handler is not a pattern worth keeping;
   directory config belongs in `DirectorySyncSettings` like the Entra settings already do.
2. Add a shared `requireSession()` / `requireRole()` guard next to `requireAdmin()` and apply it at the top of
   every remaining route handler. A small wrapper keeps it one line per route:

   ```ts
   // src/lib/api-guard.ts
   export function withAdmin<T>(handler: (req: Request, s: Session) => Promise<T>) { … }
   export function withTeacher<T>(handler: (req: Request, s: Session) => Promise<T>) { … }
   ```
3. Add a regression test that walks `src/app/api/**/route.ts` and asserts each exported handler is wrapped —
   otherwise this rots again.

Rotate `LDAP_PASSWORD` (and any other secret currently in `.env` on a reachable host) once the routes are gone.

### 1.2 [S2] Login allow-list reads env; the admin UI writes the DB

`resolveMicrosoftAccess()` (`src/lib/auth.ts:52-75`) resolves the synced class groups from
`process.env.ENTRA_SYNC_CLASS_GROUP_IDS`. But the admin UI at `/admin/settings/entra-sync` persists the
selection to `DirectorySyncSettings.syncedClassGroupIds`, and every *sync* path reads it back via
`getSyncedClassGroupIds()` (`src/lib/directory-sync-settings.ts:109`).

Consequence: an admin picks class groups in the UI, sync works, and **students still cannot log in** — because
`signIn` never sees those group IDs. `.env.example:70-75` even documents the env var as a bootstrap-only
fallback, so the auth path contradicts the documented design.

Fix: `await getSyncedClassGroupIds()` in `resolveMicrosoftAccess`. It is an async DB read in the auth path, so
cache it briefly (30–60 s in-memory) to avoid a query per sign-in.

### 1.3 [S2] The OAuth scopes probably do not permit the group lookup

`src/lib/auth.ts:300-304` overrides the AzureAD provider's authorization params to `scope: 'openid profile email'`,
dropping next-auth's default `User.Read`. `fetchMicrosoftGroupIds()` then calls `GET /me/memberOf` with that
token — which requires `User.Read` **plus** `GroupMember.Read.All` or `Directory.Read.All` as *delegated*
permissions. Every sign-in is one user-delegated, paginated directory sweep whose success depends on tenant
consent state.

This is fragile even where it happens to work. The app already has a robust **app-only** Graph client
(`src/lib/graph.ts`, client-credentials + token cache + 429 retry). Prefer one of:

- **(recommended)** app-only check: `POST /users/{oid}/checkMemberGroups` with the teacher group + configured
  class group IDs as `groupIds`. One request, bounded response, no delegated consent, reuses `graphFetch`.
- or add `groups` as an **optional claim** on the app registration and read group IDs straight off the ID token
  — zero Graph calls at login (watch the ~200-group overage limit).

Two related defects in the same path:

- `resolveMicrosoftAccess()` is called **twice per sign-in** — once in the `signIn` callback
  (`auth.ts:360`) and again in `jwt` (`auth.ts:388`) — so the full paginated sweep runs twice.
- `/me/memberOf` returns **direct** memberships only, while class/student sync uses `transitiveMembers`
  (`class-student-sync.ts:334`). A student in a nested group is synced but cannot log in.
  `checkMemberGroups` is transitive and fixes this inconsistency for free.

### 1.4 [S2] Session roles never refresh

`token.role` is only written when `account` is present, i.e. on initial sign-in. With next-auth's default
30-day JWT session, a teacher removed from `ENTRA_TEACHER_GROUP_ID` — or an admin whose local role was revoked
— keeps their elevated session for up to 30 days. Add a `token.roleCheckedAt` timestamp and re-resolve when it
is older than ~15 minutes (cheap once §1.3's `checkMemberGroups` lands), or shorten `session.maxAge`.

### 1.5 [S2] `isActive` is not filtered in most read paths

The soft-delete lifecycle is implemented and correct on the write side, but only three read paths filter on it:
`api/schedules/data/route.ts:159,163`, `api/classes/route.ts:27`, `api/noten/students/route.ts:80`.

Everywhere else — `/api/students`, `/api/students/all`, `/api/students/class`, `/api/teachers`,
`/api/admin/data`, the export routes, the notensammler PDF routes — deactivated students and teachers are
still returned. Since sync now *deactivates* rather than deletes, the first real sync run will make the app
appear to accumulate ghost students rather than removing them.

Do this centrally rather than per-route. Prisma client extensions give you a default `where` per model:

```ts
// src/lib/prisma.ts
prisma.$extends({ query: { student: { findMany({ args, query }) {
  args.where = { isActive: true, ...args.where }   // callers can still opt out explicitly
  return query(args)
} } } })
```

Historical views (past schedules, past grades) must opt back in — audit those explicitly.

### 1.6 [S2] `studentPhotoSourcePriority` is silently broken

`src/app/admin/settings/entra-sync/page.tsx` uses the field name **`studentFotoQuellePriority`**
(lines 41, 111, 265, 276, 346) while the API and DB use `studentPhotoSourcePriority`. So:

- reading always falls through to `?? 'manual_first'` — the saved value never displays
- the PUT body sends a key the route ignores (`route.ts:97`), so the value can never be changed from the UI

The neighbouring `teacherPhotoSourcePriority` uses the correct name and works. This looks like a
German-translation find-and-replace that hit an identifier ("Photo Source" → "FotoQuelle"). It is a one-word
fix — rename the four client-side occurrences back to `studentPhotoSourcePriority`. The local state variables
(`photoQuellePriority`, `setFotoQuellePriority`) are cosmetic but should be renamed with them; it is the only
place in the codebase where a German word leaked into an identifier that isn't an external API field.

### 1.7 [S3] Sync engine details

`src/lib/class-student-sync.ts` and `src/lib/teacher-sync.ts` are the strongest code in the repo — idempotent,
diff-then-apply, selection-aware, soft-delete, adoption of pre-existing rows, issue collection instead of
throwing. A few sharp edges:

- **`applyClassStudentSync` re-runs `previewClassStudentSync` before applying** (`:648`). The admin approves
  diff A and diff B is applied. Low-traffic app, so the window is small, but a `fetchedAt` / diff-hash echoed
  by the client and rejected on mismatch would make the preview honest.
- **The whole apply runs inside one `prisma.$transaction`** with sequential awaits (`:710-882`). For a school
  of ~800 students that is ~1,600 round-trips inside one transaction; Prisma's default interactive-transaction
  timeout is 5 s. Raise `timeout`/`maxWait` explicitly and batch the pure-insert paths.
- **Dead code:** `isNoop()` in `teacher-sync-dialog.tsx:474` is never called.
- **Suspicious expression:** `class-student-sync.ts:489-493` —
  `studentByExternalId.get(oid) ?? (studentByExternalId.has(oid) ? null : studentByUsername.get(…) ?? null)`.
  The `has()` branch is unreachable (if `get()` returned undefined for a `Map<string, T>` where `T` is never
  `undefined`, `has()` is false). It reduces to `get(oid) ?? byUsername(…) ?? null`. Harmless, but it reads as
  if it were guarding something.
- **Multi-group students are skipped entirely** (`:469-480`) rather than marked `syncStatus: 'unassigned'`.
  The schema comment at `prisma/schema.prisma:26` and the locked decision in the plan both say *"mark
  unassigned and report"*; today they are only reported. A student in two class groups is invisible to sync
  and will never be deactivated either.
- **`recordSyncRun` stores only the last run.** The plan's `DirectorySyncRun` / `DirectorySyncIssue` tables
  (Phase 3) were never created, so there is no sync history to debug against.

### 1.8 [S3] `saveUserRole` is a non-atomic delete-then-create

`auth.ts:168-186` does `deleteMany` then `create` outside a transaction, and `UserRole.userId` is a plain
string with no FK to any user table. Concurrent sign-ins can interleave into duplicate or zero rows. Wrap in
`$transaction`, or model it as an upsert against a unique `(userId, roleId)` constraint.

### 1.9 [S3] Middleware repetition and a typo

`src/middleware.ts:29-81` repeats the same `getToken` + role check six times, once per path prefix — including
`/schedueles` (`:47`), a typo that the file's own doc comment acknowledges. Collapse to:

```ts
const PROTECTED = ['/schedule', '/admin', '/students', '/notensammler', '/noten']
if (PROTECTED.some(p => pathname.startsWith(p))) { … }
```

and drop `/schedueles` once you confirm nothing links to it.

### 1.10 [S3] Logging

`auth.ts` `console.log`s LDAP group memberships, resolved roles, and per-user role records on every login
(`:251-253, :262-264, :144, :167, :180, :188`). That is PII in the container logs. Drop to a debug flag.

---

## 2. UI — standardise and reuse

The component library (`src/components/ui/*`, shadcn-style) is fine. The problem is one layer up: the same
patterns are re-typed per feature instead of being lifted. Concrete, ordered by payoff.

### 2.1 The 14 admin tab files are one component (~1,400 → ~250 lines)

`src/app/admin/data/_components/*-tab.tsx` — `room-tab`, `subject-tab`, `learning-content-tab`, `role-tab`,
`school-holiday-tab`, `break-time-tab`, `schedule-time-tab`, `schedule-pdf-tab`, `group-assignment-tab`,
`teacher-rotation-tab`, `support-message-tab`, `school-year-tab`, `user-role-tab`, `teacher-assignment-tab`.

Diff `room-tab.tsx` against `subject-tab.tsx`: they are byte-identical apart from the `Room`/`Subject`
interface, the `columns` array, and the string `room`/`subject` appearing in four fetch URLs and three error
messages. Every one of them re-implements `useState` + `useEffect` + `fetchX` + `handleCreate` + `handleEdit` +
`handleDelete` against `/api/admin/data?model=…`.

Replace with one generic component plus a per-model config:

```tsx
// src/app/admin/data/_components/model-tab.tsx
export function ModelTab({ model, label, columns }: { model: string; label: string; columns: Column[] }) {
  const { data, isLoading, refetch } = useAdminModel(model)          // React Query
  const { create, update, remove } = useAdminModelMutations(model)   // shared, typed errors
  return <DataTable model={label} columns={columns} data={data} isLoading={isLoading}
                    onRefresh={refetch} onCreate={create} onEdit={update} onDelete={remove} />
}
```

```ts
// src/app/admin/data/_components/model-configs.ts
export const MODEL_CONFIGS = {
  room:    { label: 'Room',    columns: [ … ] },
  subject: { label: 'Subject', columns: [ … ] },
  …
}
```

`teacher-tab`, `student-tab`, `class-tab` and `schedule-tab` have genuinely extra UI (sync buttons, photo
upload, status badges) — keep them as thin wrappers that render `<ModelTab>` plus their extras via a
`toolbar` / `children` slot rather than forking the whole file.

Side benefit: the `sortable: true` flags are set on `room-tab` but missing on `subject-tab`; a shared config
makes that kind of drift visible.

### 2.2 The two sync dialogs share a state machine that isn't extracted

`teacher-sync-dialog.tsx` (574 lines) and `class-student-sync-dialog.tsx` (1,219 lines) independently
re-implement:

| duplicated concern | teacher dialog | class/student dialog |
|---|---|---|
| `DialogStage` union (`loading`/`preview`/`applying`/`done`/`error`) | `:83` | `:~` |
| `Record<id, boolean>` selection state + `buildDefaultSelection` | `:483` | `:1088` |
| preview `fetch` → apply `fetch` → toast → `onCompleted` | `:105-175` | duplicated |
| `pickInitialTab` heuristic | `:465` | `:1107,:1124,:1132` |
| counted tab trigger | `TabTrigger :492` | `OuterTrigger :1150`, `InnerTrigger :1169` |
| `EmptyState` | `:503` | `:1188` |
| issues table | `ProblemeTable :547` | `IssuesTable :1192` |

Both consume the same `EntraUserMappingIssue` shape from `src/lib/entra-user-mapper.ts` — the server side is
already deduplicated, only the client isn't. Extract into `src/components/sync/`:

- `useSyncPreview<TDiff, TSummary>({ previewUrl, applyUrl, buildSelection, buildPayload })` — the whole
  stage machine + both fetches + toast, returning `{ stage, diff, summary, error, selection, setSelection,
  reload, apply, selectedCount }`
- `<SyncDialogShell title description stage error summary footer>` — header, loading/error/done panes, footer
- `<CountTabTrigger value label count />`, `<EmptyState />`, `<IssuesTable issues />`
- `<SyncSelectionTable rows columns getKey selection onToggle />` — the checkbox+row table repeated 9 times
  across the two files

Estimated: ~1,790 lines → ~700, and a third sync dialog (rooms? groups?) becomes ~80 lines.

Add a **select-all / select-none** control while you are in there — today an admin facing 300 `toCreate` rows
must click 300 checkboxes to deselect, and `buildDefaultSelection` opts everything in by default.

### 2.3 Two data-fetching idioms; pick React Query

`@tanstack/react-query` is installed, a `QueryProvider` exists (`src/providers/query-provider.tsx`), and
`src/hooks/use-*.ts` (7 files) use it properly. Meanwhile **44 files** under `src/app` and `src/components`
hand-roll `await fetch(…)` with `useState`/`useEffect`/`isLoading`/`error` quartets — including every admin
page and both sync dialogs.

Standardise on React Query for all client reads/writes. Beyond the boilerplate saving it fixes a real bug
class: after `applyTeacherSync` the dialog calls `onCompleted()`, whose implementation re-fetches manually —
so other mounted views (the class tab, the student tab) keep showing stale rows. `queryClient.invalidateQueries`
handles that once, correctly.

### 2.4 One `apiFetch` helper instead of 30 copies

This exact block appears ~30 times:

```ts
const res = await fetch(url, …)
if (!res.ok) {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  throw new Error(body.error ?? `… fehlgeschlagen (${res.status})`)
}
return (await res.json()) as T
```

```ts
// src/lib/api-client.ts
export async function apiFetch<T>(url: string, init?: RequestInit & { errorKey?: string }): Promise<T>
```

Pair it with a single server-side error envelope — routes currently return `{ error: string }` in most places
but bare strings and differently-shaped objects in a few.

### 2.5 Language and i18n are inconsistent — often inside one component

`teacher-sync-dialog.tsx` has German tab labels (`Erstellen`, `Aktualisieren`, `Deaktivieren`, `Probleme`) next
to English column headers (`Name`, `Username`, `Changes`, `Mode`, `Entra oid`) and English prose in the dialog
description, with German toasts. `EmptyState` messages alternate between the two languages within the same
file (`:260` German, `:402` English).

Structurally: **25 of 100 `.tsx` files use `useTranslation`**. The login page is fully translated; the entire
admin area, both sync dialogs, and the settings page are hardcoded. `public/locales/{de,en}/admin.json` exist
(135 keys each) but the admin UI barely uses them.

Decision needed, then applied consistently: either (a) the admin area is German-only and you delete
`locales/en/admin.json` and stop pretending, or (b) it goes through `t()` like the rest. Half-and-half is the
worst of both. Recommendation: (b), and add an ESLint rule (`i18next/no-literal-string`) scoped to
`src/app/**` so it does not regress.

Note the sync dialogs also render **raw English DB/Entra field names as user-facing badges**
(`firstName`, `lastName`, `username`, `class` — `teacher-sync-dialog.tsx:311`). Map those through a label
dictionary; admins should not read schema identifiers.

### 2.6 Smaller consistency items

- **Two toast systems.** `sonner` is used in 7 files; `src/components/ui/toast.tsx` (Radix) is imported by
  **zero**. Delete the Radix one and its `@radix-ui/react-toast` dependency.
- **Two path aliases.** `tsconfig.json` maps both `~/*` and `@/*` to `./src/*`. 188 files use `@/`, 22 use `~/`
  — sometimes mixed inside one file (`src/components/layout/header.tsx` imports `@/lib/…` and `~/components/…`).
  Pick `@/`, codemod the 22, and remove `~/*` from `paths` so it cannot come back.
- **Two spinner idioms.** `<Spinner />` and `<Loader2 className="animate-spin" />` — both appear in
  `teacher-sync-dialog.tsx` alone (`:218`, `:452`).
- **Loading / error / empty states are hand-rolled everywhere.** A single `<AsyncState loading error empty>`
  wrapper (or React Query's `isLoading`/`isError` + a shared `<QueryBoundary>`) would replace ~40 ad-hoc blocks.
- **Formatting is inconsistent at file level.** `src/app/login/page.tsx` and `src/components/layout/header.tsx`
  are tab-indented; the admin components are 2-space. Prettier is configured but clearly not enforced — add
  `format:check` to CI.

### 2.7 Dead code to delete

- `src/app/admin/login-settings/_components/ldap-config.tsx` (310 lines) and
  `microsoft-oauth-config.tsx` (134 lines) — there is **no `page.tsx`** in `login-settings/` and nothing in the
  repo imports either component. They are the only consumers of the two `ldap-config` API routes from §1.1;
  delete all four together.
- `isNoop()` in `teacher-sync-dialog.tsx:474`.
- `src/components/ui/toast.tsx` (see §2.6).

### 2.8 Light modernisation (worth doing while touching these files)

Keeping the current visual language, not a redesign:

- **Admin shell is not responsive.** `admin-menu.tsx` renders a fixed `w-72 … min-h-screen` sidebar with no
  breakpoint and no collapse. On a laptop in a classroom that is a third of the viewport. Make it a
  `Sheet`/drawer under `md:` and collapsible above it.
- **Skeletons instead of spinners** for table and card loads — the `DataTable` already knows its column count,
  so a shimmer row is nearly free and removes the layout jump.
- **Sticky table headers + a max-height scroll container** in `DataTable` (460 lines, hand-rolled). The sync
  dialogs already use `max-h-[50vh] overflow-y-auto`; the main tables do not, so a 500-row student list scrolls
  the whole page away from its controls.
- **Consistent page header.** Admin pages each open differently; a shared
  `<PageHeader title description actions />` would unify `/admin/data/[section]` and
  `/admin/settings/entra-sync`.
- **Dialog width tokens.** `max-w-4xl` on one sync dialog, other values elsewhere — put 2–3 sizes on the
  `Dialog` component as a `size` prop.
- **`DirectorySyncSettings.lastSyncSummary`** is stored but never rendered. A small "last sync" card on the
  Entra settings page (when, status, created/updated/deactivated counts, issue count) is the single highest-value
  new piece of UI for operating this thing.

---

## 3. LDAP → Microsoft 365: what is left

### 3.1 What already exists (and the plan file wrongly says is `todo`)

`.cursor/plans/entra-migration-progress.md` lists Phases 0–6 all as `todo` and its "Current Overall Status"
block is entirely unticked. In reality:

| Plan phase | Reality |
|---|---|
| 1 — Parallel auth cut-in | **Done.** `AUTH_LDAP_ENABLED` / `AUTH_MS_ENABLED` toggles (`auth.ts:207,296`), Microsoft button first on the login page, additive local admin, `ENTRA_SUPER_ADMIN_OBJECT_ID` guard (`require-admin.ts`). |
| 2 — Graph integration layer | **Done.** `src/lib/graph.ts` (app-only token + cache, paging, 429/Retry-After), `src/lib/entra-user-mapper.ts` (canonical DTO + issue reporting). |
| 3 — DB migration A | **Done.** `externalId`/`externalSource`/`isActive`/`deactivatedAt`/`lastSyncedAt`/`syncStatus` + indexes on `Student`, `Teacher`, `Class`; `DirectorySyncSettings` singleton. Migrations `20260422150000`, `20260422161110`, `20260422180000`. |
| 4 — Sync engine | **Done.** `teacher-sync.ts` + `class-student-sync.ts`: diff/upsert, create/move/inactivate/reactivate, adoption of legacy rows, transactional apply. |
| 5 — Admin UX | **Mostly done.** Preview/apply endpoints + both dialogs + group-picker settings page, all `requireAdmin`-guarded. |

**Action: rewrite that plan file to match reality** before anything else, and move it out of `.cursor/` into
`docs/` so it is not tool-specific.

### 3.2 Blocking gaps before you can turn LDAP off

1. **[S2] Login allow-list must read the DB** — §1.2. Without this, switching a class group in the UI silently
   locks students out. *Small fix, highest priority.*
2. **[S2] Replace `/me/memberOf` with an app-only `checkMemberGroups`** — §1.3. Removes the delegated-consent
   dependency, halves the per-login Graph traffic, and makes login membership transitive so it agrees with sync.
3. **No nightly sync worker exists.** `syncMode: 'hybrid' | 'nightly_only'` is plumbed through the DB, the API,
   and the settings UI — but nothing schedules anything. `grep -rn "cron|nightly|setInterval"` finds only type
   definitions. `nightly_only` currently means *"never syncs"*. Needs one of:
   - a `POST /api/admin/sync/run` route guarded by a shared secret header, called by an external cron
     (systemd timer / k8s CronJob / GitHub Actions) — simplest given the Docker Compose deployment;
   - or an in-process scheduler in `instrumentation.ts` — but that misbehaves with multiple replicas.

   Whichever: it must call `applyTeacherSync()` then `applyClassStudentSync()` with **no selection** (apply
   everything), and record the run.
4. **[S2] Filter `isActive` in read paths** — §1.5. Deactivation is meaningless until reads respect it.
5. **`syncStatus: 'unassigned'` is never written** — §1.7. Students in 0 or 2+ class groups are silently
   skipped, so they neither get a class nor get deactivated. Decide the behaviour and implement it, because
   during a migration multi-group membership will be common.
6. **Guard rail against a bad sync.** `applyClassStudentSync` with no selection will happily deactivate every
   student if the Graph call returns an empty group. Add a threshold — refuse to apply if deactivations exceed
   e.g. 20 % of active rows unless explicitly overridden — and surface it in the dialog. This matters most for
   the *unattended* nightly path from gap 3, where no human sees the preview.

### 3.3 LDAP retirement checklist (Phase 6)

Files that still touch LDAP:

```
src/lib/ldap.ts                                  ← LDAPClient (397 lines)
src/lib/auth.ts                                  ← CredentialsProvider 'ldap' (:207-295)
src/app/login/page.tsx                           ← username/password form (:104-135)
src/app/api/admin/ldap-config/route.ts           ← delete now (§1.1)
src/app/api/auth/ldap-config/route.ts            ← delete now (§1.1)
src/app/admin/login-settings/_components/ldap-config.tsx  ← already orphaned (§2.7)
src/app/api/students/import/route.ts             ← LDAP student import
src/app/api/students/import/save/route.ts
src/app/api/teachers/import/route.ts             ← LDAP teacher import
src/app/api/teachers/import/save/route.ts
scripts/audit-teacher-identity-collisions.ts     ← keep; migration-support tooling
scripts/merge-teacher-identities.ts              ← keep; migration-support tooling
```

Retirement order:

1. Delete the two `ldap-config` routes + orphaned UI **now** — they are a live credential leak and nothing
   uses them (§1.1, §2.7).
2. Close the gaps in §3.2, run `hybrid` mode for one observation window (a few weeks, ideally spanning a
   class-list change) with LDAP still enabled as fallback.
3. Confirm every active `Teacher`/`Student`/`Class` row has `externalSource = 'entra'` — anything still
   `null`/`'ldap'` was never adopted by sync and will be orphaned by the cutover. The existing
   `db:audit-teacher-identities` script is the right shape for this; add a student/class equivalent.
4. Set `AUTH_LDAP_ENABLED=false` in production. Remove the LDAP form from `login/page.tsx` — at that point the
   login page is a single Microsoft button and the `username`/`password`/`error` state can go too.
5. Delete the LDAP import routes (their function is fully covered by class/student sync + the existing
   CSV import components), then `src/lib/ldap.ts`, the `CredentialsProvider` block, `ldapjs` +
   `@types/ldapjs` from `package.json`, and the `LDAP_*` / `AZURE_AD_*` / `MS_*` blocks from `.env.example`.
6. `graph.ts:21-23` and `auth.ts:297-299` still fall back through `AZURE_AD_*` and `GRAPH_*` names. Once
   production is on `ENTRA_*`, collapse those chains — three env-var names for one value is how a tenant ends
   up misconfigured in a way that only fails at 2am.

Note `.env.example` currently declares `LDAP_PASSWORD` **twice** (lines 27 and 30) — harmless, but it suggests
the file is being edited by hand without review.

---

## 4. Suggested order of work

| # | Item | § | Effort |
|---|---|---|---|
| 1 | Delete both `ldap-config` routes + orphaned `login-settings` UI; rotate `LDAP_PASSWORD` | 1.1, 2.7 | S |
| 2 | Add auth guards to all remaining API routes + a test that enforces it | 1.1 | M |
| 3 | Fix `studentFotoQuellePriority` → `studentPhotoSourcePriority` | 1.6 | XS |
| 4 | Login allow-list reads DB, not env | 1.2 | S |
| 5 | Replace `/me/memberOf` with app-only `checkMemberGroups`; call it once per sign-in | 1.3 | M |
| 6 | `isActive` filtering via Prisma client extension | 1.5 | M |
| 7 | Nightly sync entrypoint + deactivation threshold guard | 3.2 | M |
| 8 | Rewrite the migration plan file to match reality; move to `docs/` | 3.1 | S |
| 9 | Extract `ModelTab` + `MODEL_CONFIGS`; collapse the 14 tab files | 2.1 | M |
| 10 | Extract `src/components/sync/*`; refactor both dialogs onto it | 2.2 | M |
| 11 | `apiFetch` + React Query everywhere; delete Radix toast; unify `@/` alias | 2.3, 2.4, 2.6 | M |
| 12 | i18n decision + enforcement for the admin area | 2.5 | M |
| 13 | Responsive admin shell, skeletons, sticky headers, last-sync card | 2.8 | M |
| 14 | LDAP retirement | 3.3 | M |

Items 1–7 are correctness and security and should not wait on the UI work. Items 9–11 are pure deletion —
roughly 2,000 lines removed with no behaviour change — and are the cheapest way to make items 12–13 tractable.
