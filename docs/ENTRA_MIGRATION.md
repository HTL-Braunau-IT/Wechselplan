# LDAP → Microsoft 365 / Entra migration

Status as of 2026-07-29. Replaces `.cursor/plans/entra-migration-progress.md`, which listed every
phase as `todo` long after most of them had shipped and was therefore actively misleading.

**LDAP has been removed from the codebase.** Entra is the only identity provider and the only
directory source. See [LDAP retirement](#ldap-retirement) for what went and what the deployment
still has to do. The class-move semantics that sync depends on are written up separately in
[`CLASS_MOVE.md`](./CLASS_MOVE.md).

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
| Microsoft login | `src/lib/auth.ts` | The only provider. `/login` is a single button; the LDAP form and both `AUTH_*_ENABLED` toggles are gone. |
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

Required for Microsoft login and sync. The first three are now **required by `src/env.js`**,
not optional: without them the app can neither authenticate anyone nor sync, so it fails at boot
rather than at the login page.

```
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_TEACHER_GROUP_ID=
ENTRA_SUPER_ADMIN_OBJECT_ID=
ENTRA_SYNC_ENABLED=true
SYNC_TRIGGER_SECRET=            # required for the nightly run
SYNC_MAX_DEACTIVATION_RATIO=0.2 # optional, defaults to 0.2
```

`GRAPH_*` is a **different app registration**, used only for support-mail sending. Directory
sync no longer falls back to it — it carries `Mail.Send`, not `User.Read.All`, so borrowing it
produced a token that authenticated and then 403'd in the middle of a nightly run.

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
---

## LDAP retirement

### Done in the codebase

| Removed | Note |
|---|---|
| `src/lib/ldap.ts` | The `LDAPClient`. |
| `CredentialsProvider('ldap')` in `src/lib/auth.ts` | Azure AD is the sole provider; the `LDAPUser` type and both `isEnabled` toggles went with it. |
| The form on `src/app/login/page.tsx` | One Microsoft button; the username/password/error state is gone. |
| `src/app/api/students/import/**` | `route.ts` and `save/route.ts` both bound LDAP directly, and `save` **hard-deleted every student in the class** before recreating them — irreconcilable with the soft-delete model. `sample/route.ts` and the unmounted `components/admin/csv-import.tsx` went with them as their only consumers. |
| `src/app/api/teachers/import/route.ts` | LDAP teacher fetch. `teachers/import/save/route.ts` is a plain JSON upsert with tests and **stays**. |
| `ldapjs`, `@types/ldapjs` | Plus `serverExternalPackages` in `next.config.js`, which existed only for them. |
| `LDAP_*`, `AUTH_LDAP_ENABLED`, `AUTH_MS_ENABLED` | Out of `src/env.js`, `.env.example`, `docker-compose.yaml`. |
| `AZURE_AD_*`, `MS_STUDENT_GROUPS`, `MS_TEACHER_GROUPS` | Legacy aliases. `graph.ts` no longer falls back through `AZURE_AD_*` → `GRAPH_*` either. |

Kept: `scripts/audit-teacher-identity-collisions.ts` and `scripts/merge-teacher-identities.ts` —
migration tooling that reads LDAP-era rows without talking to LDAP.

### Still to do at the deployment, before shipping this

The code is ready; the rollout is not something code can do.

1. **Run the adoption audit and get a clean bill.**

   ```bash
   npm run db:audit-entra-adoption
   ```

   It reports every active Student/Teacher/Class row whose `externalSource` is not `entra`,
   with the dependent-record counts each one would strand, plus any `GroupAssignment` rows
   pointing at a class name no active class holds. Exit code 0 means the audit found none of
   those; it says nothing about steps 2 and 3, which it cannot see. An unadopted row is not
   merely stale after cutover — sync only ever deactivates rows it owns, so it will never even
   be reported.

2. **Rotate `NEXTAUTH_SECRET`.** Sessions minted by the LDAP provider are valid for 30 days and
   their `sub` is a username, not an Entra object id, so their role cannot be re-resolved against
   Graph. The `jwt` callback now demotes any token without `provider === 'azure-ad'` to the
   powerless `user` role, but rotating the secret is what actually ends those sessions.

3. **Confirm every human has an Entra path in.** With LDAP gone there is no fallback: a teacher
   who is in neither `ENTRA_TEACHER_GROUP_ID` nor a synced class group cannot log in at all.

   The two paths are independent. Configuring the teacher group but no class groups admits
   teachers and locks out students; configuring class groups but no teacher group admits
   everyone as a `student`. Only when **neither** is configured does `resolveMicrosoftAccess`
   have nothing to ask Graph about, and it then denies rather than falling open — which locks
   out *everyone, including the super admin*, because `ENTRA_SUPER_ADMIN_OBJECT_ID` is applied
   in the `jwt` callback and never runs if `signIn` has already refused. Set
   `ENTRA_TEACHER_GROUP_ID` before first boot; it is the bootstrap path into
   `/admin/settings/entra-sync`, where the class groups are picked.

---

## Testing matrix

| Case | Covered by |
|---|---|
| Teacher login succeeds | `src/lib/__tests__/microsoft-access.test.ts` |
| Student login succeeds | same |
| Non-member is denied | same |
| Nothing configured → denied, not open | same |
| Group list comes from the DB, not env | same |
| Retired `MS_*` groups are ignored | same |
| Mass deactivation refused | `src/lib/__tests__/sync-guard.test.ts` |
| Soft-deleted rows excluded from reads | `src/lib/__tests__/prisma-active-filter.test.ts` |
| API access policy | `src/lib/__tests__/api-access.test.ts`, `src/app/api/__tests__/route-guards.test.ts` |
| Class move clears the rotation group | `src/lib/__tests__/class-student-sync-move.test.ts` |
| Class move repoints `ClassMembership` | same |
| Profile-only change keeps the group | same |
| Class rename carries `GroupAssignment` over | same |
| Add/remove/reactivate against a real database | **not covered** — needs an integration test against a seeded database |
| Sync duration at tenant size | **not measured** — see remaining work item 3 |
