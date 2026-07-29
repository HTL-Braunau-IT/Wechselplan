# LDAP → Microsoft 365 / Entra migration

Status as of 2026-07-29. Replaces `.cursor/plans/entra-migration-progress.md`, which listed every
phase as `todo` long after most of them had shipped and was therefore actively misleading.

---

## Locked decisions

These have not changed and the implementation follows them:

- Classes are **Entra security groups**.
- Roles: `teacher` = member of `ENTRA_TEACHER_GROUP_ID`; `student` = anyone else who is allowed in;
  `admin` = an additive local flag, granted only by `ENTRA_SUPER_ADMIN_OBJECT_ID`.
- Login is allowed only for members of the teacher group **or** at least one synced class group.
- Students are **soft-removed** (`isActive = false`), never hard-deleted, and auto-reactivate if
  they reappear in Entra.
- Entra is the source of truth for profile fields; sync always overwrites them.
- External identity key is the Entra Object ID (`externalId`).
- Ambiguous membership (a student in several class groups) is recorded, not silently skipped.

---

## What is implemented

| Area | Where | Notes |
|---|---|---|
| Parallel LDAP + Microsoft login | `src/lib/auth.ts` | Toggled with `AUTH_LDAP_ENABLED` / `AUTH_MS_ENABLED`; Microsoft is the primary button on `/login`. |
| Role resolution | `src/lib/auth.ts` → `resolveMicrosoftAccess` | App-only Graph `checkMemberGroups`, transitive, memoised for 15 minutes, re-checked on that cadence rather than only at sign-in. |
| Additive local admin | `src/lib/require-admin.ts` | Super-admin object id auto-grants on login. |
| Graph client | `src/lib/graph.ts` | Client-credentials token with cache, paging, 429/Retry-After handling, photo fetch. |
| Mapper | `src/lib/entra-user-mapper.ts` | Canonical `EntraUser` DTO; unmappable members become reportable issues rather than exceptions. |
| Schema | `prisma/schema.prisma` | `externalId`, `externalSource`, `isActive`, `deactivatedAt`, `lastSyncedAt`, `syncStatus` on Student/Teacher/Class, plus the `DirectorySyncSettings` singleton. |
| Teacher sync | `src/lib/teacher-sync.ts` | Diff/apply with create, update, adopt, deactivate, reactivate. |
| Class + student sync | `src/lib/class-student-sync.ts` | As above, plus class membership resolution and `syncStatus = 'unassigned'` for ambiguous membership. |
| Admin preview/apply UI | `src/app/admin/data/_components/*-sync-dialog.tsx` | Per-row selection, select-all, issues tab; built on `src/components/sync/`. |
| Group picker + settings | `src/app/admin/settings/entra-sync/` | Writes `DirectorySyncSettings`; shows the last run via `LastSyncCard`. |
| Unattended run | `src/app/api/sync/run/route.ts`, `src/lib/directory-sync.ts` | Shared-secret entrypoint for an external scheduler. |
| Mass-deactivation guard | `src/lib/sync-guard.ts` | Refuses an unattended run that would retire more than `SYNC_MAX_DEACTIVATION_RATIO` of active rows. |
| Active-only reads | `src/lib/prisma.ts` | Soft-deleted people are excluded by default; `ANY_ACTIVE_STATE` opts out. |

---

## Environment

Required for Microsoft login and sync:

```
AUTH_MS_ENABLED=true
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_TEACHER_GROUP_ID=
ENTRA_SUPER_ADMIN_OBJECT_ID=
ENTRA_SYNC_ENABLED=true
SYNC_TRIGGER_SECRET=            # required for the nightly run
SYNC_MAX_DEACTIVATION_RATIO=0.2 # optional, defaults to 0.2
```

`ENTRA_SYNC_CLASS_GROUP_IDS` is a **first-run bootstrap only**. Once an admin has picked groups in
`/admin/settings/entra-sync`, the database is authoritative for both sync scope and login
eligibility.

### Graph permissions

Application permissions on the app registration, with admin consent:

- `User.Read.All` — read teacher and student profiles
- `GroupMember.Read.All` — resolve group membership at login and during sync

No delegated Graph permissions are needed. Login requests only the OIDC scopes
(`openid profile email`); membership is resolved app-only. This is deliberate — the delegated
`/me/memberOf` call this used to make needed consent the provider never requested, and returned
direct memberships only, so a student in a nested group could be synced but unable to log in.

---

## Scheduling the nightly sync

The app has no in-process scheduler: with more than one replica each would run its own timer and
they would race applying the same diff. Drive it externally instead.

```bash
curl -fsS -X POST https://wp.example.at/api/sync/run \
  -H "x-sync-secret: $SYNC_TRIGGER_SECRET"
```

`docker-compose.yaml` includes a `sync-scheduler` service that does exactly this at 02:00. A
systemd timer or a Kubernetes CronJob works the same way.

Response codes are meaningful — a scheduler that only checks for failure still learns about a
degraded run:

- `200` — applied cleanly
- `207` — applied with issues, or one of the two scopes failed
- `500` — the run failed
- `503` — `SYNC_TRIGGER_SECRET` is not set, so the endpoint is off
- `401` — wrong or missing secret

A run is skipped (reported as `skipped` in the body) when sync is disabled in the admin settings or
when no class groups are configured.

---

## Remaining work

1. **Sync history.** `recordSyncRun` overwrites a single row, so only the most recent run survives.
   The `DirectorySyncRun` / `DirectorySyncIssue` tables from the original plan were never created,
   and without them there is nothing to debug an intermittent failure against.
2. **Preview/apply race.** `applyClassStudentSync` recomputes the diff before applying, so an admin
   approves diff A and diff B is applied. The window is small for a school this size, but echoing
   `fetchedAt` back and rejecting a mismatch would make the preview honest.
3. **Transaction size.** The whole apply runs as one interactive transaction with sequential awaits
   — roughly 1,600 round-trips for 800 students, against Prisma's 5 second default timeout. Raise
   `timeout`/`maxWait` explicitly and batch the pure-insert path before the first full-size run.
4. **Adoption audit.** Before turning LDAP off, confirm every active Teacher/Student/Class row has
   `externalSource = 'entra'`. Anything still `null` was never adopted by sync and will be orphaned
   at cutover. `npm run db:audit-teacher-identities` covers teachers; students and classes need an
   equivalent.

---

## LDAP retirement checklist

Not yet started — it should follow an observation window in `hybrid` mode that spans at least one
real class-list change.

Files that still touch LDAP:

```
src/lib/ldap.ts                          LDAPClient
src/lib/auth.ts                          CredentialsProvider 'ldap'
src/app/login/page.tsx                   username/password form
src/app/api/students/import/route.ts     LDAP student import
src/app/api/students/import/save/route.ts
src/app/api/teachers/import/route.ts     LDAP teacher import
src/app/api/teachers/import/save/route.ts
scripts/audit-teacher-identity-collisions.ts   keep — migration tooling
scripts/merge-teacher-identities.ts            keep — migration tooling
```

Order:

1. Run in `hybrid` mode with LDAP still enabled as a fallback.
2. Complete the adoption audit in item 4 above.
3. Set `AUTH_LDAP_ENABLED=false` in production and watch for a week.
4. Remove the LDAP form from `login/page.tsx`; the page becomes a single Microsoft button and the
   username/password/error state goes with it.
5. Delete the LDAP import routes — class/student sync plus the existing CSV import cover their
   function — then `src/lib/ldap.ts`, the `CredentialsProvider` block, `ldapjs` and `@types/ldapjs`
   from `package.json`, and the `LDAP_*` block from `.env.example`.
6. Collapse the legacy env fallbacks. `graph.ts` and `auth.ts` still read through
   `AZURE_AD_*` and `GRAPH_*` names, and `resolveMicrosoftAccess` still honours `MS_STUDENT_GROUPS`
   / `MS_TEACHER_GROUPS`. Three accepted names for one value is how a tenant ends up misconfigured
   in a way that only shows up at 02:00.

---

## Testing matrix

| Case | Covered by |
|---|---|
| Teacher login succeeds | `src/lib/__tests__/microsoft-access.test.ts` |
| Student login succeeds | same |
| Non-member is denied | same |
| Nothing configured → denied, not open | same |
| Group list comes from the DB, not env | same |
| Legacy `MS_*` groups still honoured | same |
| Mass deactivation refused | `src/lib/__tests__/sync-guard.test.ts` |
| Soft-deleted rows excluded from reads | `src/lib/__tests__/prisma-active-filter.test.ts` |
| API access policy | `src/lib/__tests__/api-access.test.ts`, `src/app/api/__tests__/route-guards.test.ts` |
| Full add/move/remove/reactivate lifecycle | **not covered** — needs an integration test against a seeded database |
| Sync duration at tenant size | **not measured** — see remaining work item 3 |
