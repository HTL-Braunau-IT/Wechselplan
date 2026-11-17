# Plan: remove the licence server / entitlements

## Why

The licence server gates features per deployment (`LICENSE_SERVER_URL` +
`LICENSE_KEY`, see `docs/ENTITLEMENTS_INTEGRATION.md`). With a partner school
self-hosting (`docs/SELF_HOSTING.md`), it is a liability:

- **Fail-closed on the whole app.** Without a key or `DISABLE_ENTITLEMENTS`, the
  `base` feature is missing. `src/app/layout.tsx` and `LicenseGate` then show
  "Es ist keine gültige Lizenz vorhanden" to every signed-in user. A licence-server
  outage longer than the 24 h stale window does the same to **our** production.
- **External dependency at request time:** an outbound HTTP call from the server,
  plus a cache, for no functional gain.
- **One flag is not a licence at all.** `notenmgmt_htl` really means "this school
  uses the HTL Notenmanagement system", which is configuration.

## Target state

- No licence server, no `LICENSE_*` / `DISABLE_ENTITLEMENTS` env vars, no lock screen.
- All modules (Schedule, Noten, Notensammler, student photos) are always on.
- The Notenmanagement transfer is on **iff** `NOTENMANAGEMENT_BASE_URL` is set. That
  variable becomes optional, which also removes the dummy-URL workaround in
  SELF_HOSTING §3.

Out of scope: per-school module toggles. If a partner later wants to hide a module,
add it as an admin setting in the DB, not as an env var or a licence.

## Inventory (as of this plan)

| Area | Files |
|---|---|
| Core | `src/lib/entitlements.ts`, `src/types/entitlements.ts`, `src/contexts/entitlements-context.tsx` |
| Lock screen | `src/app/layout.tsx` (server-side `base` check), `src/components/license-gate.tsx`, wrapped in `src/app/providers.tsx` |
| API endpoints | `src/app/api/entitlements/route.ts`, `src/app/api/entitlements/health/route.ts`, rule in `src/lib/api-access.ts:50` |
| Server gates (`isFeatureEnabled`) | 39 route handlers under `src/app/api/noten/**`, `src/app/api/notensammler/**`, `src/app/api/students/photo/**`, `src/app/api/admin/student-photos/upload`, `src/app/api/integrations/online-shell/grades`; page layouts `src/app/noten/layout.tsx`, `src/app/notensammler/layout.tsx` |
| Client gates (`useEntitlements`) | `nav-items.ts`, `admin-menu.tsx`, `admin/data/[section]/page.tsx`, `admin/data/_components/data-sections.tsx` (`requiresFeature`), `teacher-dashboard.tsx`, `student-photo.tsx`, `noten/page.tsx`, `noten/_hooks/use-noten-data.ts` |
| `notenmgmt_htl` | `src/app/api/notensammler/transfer/route.ts:106`, `src/app/noten/page.tsx:256` |
| Tests mocking it | 6 route tests (`vi.mock('@/lib/entitlements', …)`), `src/app/noten/_hooks/__tests__/use-noten-data.test.tsx` |
| Config / docs | `src/env.js`, `.env.example`, `docker-compose.yaml`, `docs/ENTITLEMENTS_INTEGRATION.md`, `docs/LICENSE_SERVER_DESIGN.md`, `CLAUDE.md` (Entitlements bullet), `src/middleware.ts:43` (comment) |

## Steps

Three PRs, so that the risky part (the lock screen) goes first and small, and the
big mechanical diff carries no behaviour change.

### PR 1: stop depending on the server (small, behaviour change)

1. `src/lib/entitlements.ts`: replace the fetch/cache logic with a pure function:

   ```ts
   export async function getEnabledFeatures(): Promise<FeatureKey[]> {
     return ALL_FEATURE_KEYS.filter(k => k !== 'notenmgmt_htl' || isNotenmanagementConfigured())
   }
   ```

   Keep the async signature and `isFeatureEnabled` for now, so none of the 39 call
   sites change in this PR.
2. Add `isNotenmanagementConfigured()` (e.g. in `src/lib/notenmanagement/config.ts`).
   It returns whether `env.NOTENMANAGEMENT_BASE_URL` is set.
3. `src/env.js`: `NOTENMANAGEMENT_BASE_URL` → `.optional()`. Remove
   `LICENSE_SERVER_URL`, `LICENSE_KEY` and `DISABLE_ENTITLEMENTS` from `server` and
   `runtimeEnv`.
4. `src/lib/notenmanagement/server-client.ts`: with the URL unset, throw a clear
   "Notenmanagement nicht konfiguriert" error and answer **503**, not a 500. Check
   the link-sync admin page and the transfer routes for the same.
5. Remove the lock screen. Delete the `hasBase` branch in `src/app/layout.tsx` and
   `src/components/license-gate.tsx`, and unwrap it in `src/app/providers.tsx`.
6. Delete `src/app/api/entitlements/health/route.ts`. Keep `GET /api/entitlements`
   for now: the client context and the mobile app may read it. Remove the health
   entry from `api-access.ts` if it has its own rule; `route-guards.test.ts` will
   complain otherwise.
7. Remove `LICENSE_*` and `DISABLE_ENTITLEMENTS` from `.env.example` and
   `docker-compose.yaml`.
8. Tests: add a unit test for `getEnabledFeatures` (with and without the NM URL).
   `npm run check` and `npx vitest run`.

**Rollout:** no migration. Our prod `.env` still has `LICENSE_KEY`, which becomes
inert because unknown vars are ignored. Delete it from `/srv/wechselplan{,-staging}/.env`
afterwards. Partners can drop `DISABLE_ENTITLEMENTS=true`, which also becomes inert.

### PR 2: remove the server-side gates (mechanical, no behaviour change)

After PR 1, every gate except `notenmgmt_htl` is constantly `true`.

1. In each of the 39 route handlers, delete the `if (!(await isFeatureEnabled('…')))
   return 403` block and the import. Done per directory, it is a reviewable,
   search-and-delete diff. In `src/app/api/noten/data/route.ts:83`,
   `notensammlerEnabled` becomes `true`. Inline it and simplify the branch.
2. `src/app/noten/layout.tsx` and `src/app/notensammler/layout.tsx`: drop the check
   and render children.
3. `src/app/api/notensammler/transfer/route.ts:106`: replace
   `isFeatureEnabled('notenmgmt_htl')` with `isNotenmanagementConfigured()`.
4. Drop `vi.mock('@/lib/entitlements', …)` from the 6 route tests. For
   `notenliste-suggestions` and `sokrates/changes/acknowledge`, which assert the
   disabled path, **delete those test cases**: the path no longer exists.
5. Grep check: `rg "isFeatureEnabled|@/lib/entitlements" src/app/api` should return
   nothing.

### PR 3: remove the client side and the remains

1. Replace `useEntitlements()` at each client call site:
   - `nav-items.ts`, `teacher-dashboard.tsx`, `student-photo.tsx`, `admin-menu.tsx`,
     `admin/data/[section]/page.tsx`: remove the condition and always show.
   - `data-sections.tsx`: drop the `requiresFeature` field.
   - `noten/page.tsx:256` (`canTransfer`): needs the NM flag on the client. Expose
     it from an existing config endpoint or as a server-rendered prop, **not** as a
     `NEXT_PUBLIC_` var: env is baked at build time and the image is shared across
     schools.
   - `use-noten-data.ts`: remove the feature input; update its test.
2. Delete `src/contexts/entitlements-context.tsx`, `src/types/entitlements.ts`,
   `src/lib/entitlements.ts`, `src/app/api/entitlements/route.ts`, and the
   `/api/entitlements` rule in `src/lib/api-access.ts`.
   - **Check the mobile app (Wechselplan-App) first.** If it calls
     `GET /api/entitlements`, either keep a stub returning all features for one
     release cycle, or ship the app update first.
3. Docs: delete `docs/ENTITLEMENTS_INTEGRATION.md` and `docs/LICENSE_SERVER_DESIGN.md`.
   Remove the Entitlements bullet from `CLAUDE.md`, fix the comment in
   `src/middleware.ts:43`, and update `docs/SELF_HOSTING.md` §3 and §7: remove
   `DISABLE_ENTITLEMENTS` and the lock-screen row, and mark `NOTENMANAGEMENT_BASE_URL`
   optional.
4. Final grep: `rg -i "entitlement|LICENSE_KEY|LICENSE_SERVER|DISABLE_ENTITLEMENTS|license-gate"`
   should only hit changelog or history.

### Afterwards

- Decommission the licence server and revoke all issued keys once our prod and
  staging run PR 1.
- Remove the "Licence gate" item from `docs/SELF_HOSTING_UPSTREAM.md` §3.

## Risks

| Risk | Mitigation |
|---|---|
| Mobile app depends on `/api/entitlements` | Check before PR 3; keep a stub if needed |
| An NM route not covered by step 4 of PR 1 crashes with an unset URL | Grep `env.NOTENMANAGEMENT_BASE_URL` and `server-client` imports; test with the var unset locally |
| Partner instance between PR 1 and PR 3 | Each PR is behaviour-safe on its own; `DISABLE_ENTITLEMENTS=true` keeps working until PR 1 and is harmless after |
| A gate hid an unfinished feature, not a licence | Review the 4 feature keys with the team before PR 2. Today all four are shipped features. |
