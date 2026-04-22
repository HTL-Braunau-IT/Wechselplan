# Entra/O365 Migration Progress Plan

## Objective
Migrate from LDAP-based auth and directory import to Microsoft 365 login + Entra/Graph sync with safe lifecycle handling (soft-remove/reactivate), while running LDAP and Microsoft login in parallel during rollout.

## Tracking Conventions
- Status: `todo` -> `in_progress` -> `done` -> `blocked`
- Keep each checkbox updated as work progresses.
- Add date + short note in the Decision Log when scope changes.

---

## Locked Decisions
- [x] Classes are represented by **Entra security groups**.
- [x] Role mapping:
  - teacher = member of `ENTRA_TEACHER_GROUP_ID`
  - student = allowed login user not in teacher group
  - admin = additive local flag (managed in app)
- [x] Login allowed only if user is in teacher group OR at least one synced class group.
- [x] Users outside synced groups cannot log in.
- [x] Synced class groups are configurable (multi-group selection list).
- [x] Student lifecycle: soft-remove only (`isActive=false`), no hard delete.
- [x] Reactivation: auto-reactivate if user reappears in Entra.
- [x] Ambiguous memberships (none/multiple): mark unassigned and report.
- [x] Profile ownership: Entra is source of truth (always overwrite profile fields).
- [x] External identity key: Entra Object ID.
- [x] Rollout mode starts as hybrid (nightly auto + manual preview/apply), with later switch to nightly-only.

---

## Environment Variables (Target)
- [ ] `AUTH_MS_ENABLED`
- [ ] `AUTH_LDAP_ENABLED`
- [ ] `ENTRA_TENANT_ID`
- [ ] `ENTRA_CLIENT_ID`
- [ ] `ENTRA_CLIENT_SECRET` (or certificate equivalent)
- [ ] `ENTRA_TEACHER_GROUP_ID`
- [ ] `ENTRA_SYNC_CLASS_GROUP_IDS` (comma-separated list)
- [ ] `ENTRA_SUPER_ADMIN_OBJECT_ID`
- [ ] `ENTRA_SYNC_MODE` (`hybrid` or `nightly_only`)
- [ ] `ENTRA_SYNC_ENABLED`

Notes:
- `ENTRA_SYNC_CLASS_GROUP_IDS` drives both sync scope and login eligibility for non-teachers.
- Keep `.env.example` and runtime validation in sync.

---

## Phase 0 - Preflight
- [ ] Confirm Entra app registration and required Graph permissions.
- [ ] Confirm consent is granted in target tenant(s).
- [ ] Confirm naming and ownership of class security groups.
- [ ] Confirm expected group cardinality and paging requirements.
- [ ] Confirm deployment secrets strategy for dev/stage/prod.

Exit criteria:
- [ ] All required secrets exist in target environments.
- [ ] Can fetch teacher group and sample class group via Graph successfully.

---

## Phase 1 - Parallel Auth Cut-In
- [ ] Refactor auth providers to support parallel LDAP + Microsoft with feature flags.
- [ ] Make Microsoft login the default entry path on login UI.
- [ ] Implement unified role resolver:
  - [ ] teacher from `ENTRA_TEACHER_GROUP_ID`
  - [ ] student fallback if in synced class group(s)
  - [ ] deny login otherwise
- [ ] Keep additive local admin role behavior.
- [ ] Restrict admin role grant/revoke to `ENTRA_SUPER_ADMIN_OBJECT_ID`.
- [ ] Add env validation and docs updates.

Exit criteria:
- [ ] LDAP and Microsoft login both work (while toggled on).
- [ ] Unauthorized users (not in teacher/synced class groups) are denied.
- [ ] Session role behavior is consistent with middleware/API auth checks.

---

## Phase 2 - Graph Integration Layer
- [ ] Add Graph client service (`src/lib/graph.ts` or equivalent).
- [ ] Add mapper layer to canonical internal DTOs.
- [ ] Add class-group filter using `ENTRA_SYNC_CLASS_GROUP_IDS`.
- [ ] Add membership resolver for student -> class mapping.
- [ ] Implement dry-run payload model for preview/apply UX.

Exit criteria:
- [ ] Graph fetch is stable with paging/retry behavior.
- [ ] Same input yields deterministic mapped output.

---

## Phase 3 - Database Migration Runbook

### Migration A (additive, non-breaking)
- [ ] Add nullable fields to `Student`:
  - [ ] `externalId` (Entra Object ID)
  - [ ] `externalSource` (entra/ldap/legacy)
  - [ ] `isActive` (default true)
  - [ ] `deactivatedAt` (nullable)
  - [ ] `lastSyncedAt` (nullable, optional but recommended)
  - [ ] `syncStatus` (optional: active/inactive/unassigned)
- [ ] Add indexes:
  - [ ] `externalId`
  - [ ] `isActive`
  - [ ] `(classId, isActive)` where helpful

### Backfill Script
- [ ] Set `isActive=true` for existing students.
- [ ] Attempt to match existing students to Entra users.
- [ ] Write unresolved/ambiguous matches to a review report.
- [ ] Do not enforce uniqueness yet.

### Migration B (constraints after stabilization)
- [ ] Add/enable uniqueness strategy for `externalId` after data cleanup.
- [ ] Tighten non-null constraints where safe.

### Sync Audit Tables (recommended)
- [ ] Add `DirectorySyncRun` table.
- [ ] Add `DirectorySyncIssue` table.

Exit criteria:
- [ ] Existing historical relations remain intact.
- [ ] At least one full sync passes with no critical integrity issues.

---

## Phase 4 - Sync Engine (Idempotent, Non-Destructive)
- [ ] Replace destructive class sync with diff/upsert logic.
- [ ] Add behavior for:
  - [ ] create on new user
  - [ ] move on class change
  - [ ] inactivate on removal
  - [ ] reactivate on reappearance
  - [ ] mark unassigned on none/multiple class memberships
- [ ] Ensure profile fields are overwritten from Entra on sync.
- [ ] Update active-only query paths where needed (scheduling views).

Exit criteria:
- [ ] Running sync twice yields no unintended changes.
- [ ] No hard deletes for Entra-managed students.

---

## Phase 5 - Admin UX + Operations
- [ ] Add admin preview/apply endpoints for sync.
- [ ] Add sync summary UI (created/moved/inactivated/reactivated/unassigned/errors).
- [ ] Add toggle for `hybrid` vs `nightly_only`.
- [ ] Add alerting/logging for failed syncs and suspicious deltas.
- [ ] Add audit trail for admin role changes.

Exit criteria:
- [ ] Admin can safely review and apply sync changes.
- [ ] Nightly automation and manual trigger both function in hybrid mode.

---

## Phase 6 - LDAP Retirement
- [ ] Disable LDAP auth in production toggle.
- [ ] Remove LDAP login/config UI and related APIs.
- [ ] Remove LDAP import routes.
- [ ] Remove obsolete LDAP env vars and docs references.

Exit criteria:
- [ ] Microsoft/Entra-only operation is stable for agreed observation window.

---

## Testing Matrix
- [ ] Auth: teacher login success.
- [ ] Auth: student login success.
- [ ] Auth: denied user blocked.
- [ ] Role: local admin flag additive behavior works.
- [ ] Sync: add/move/remove/reactivate lifecycle.
- [ ] Sync: ambiguous membership -> unassigned + issue recorded.
- [ ] Historical data remains visible for inactive students where intended.
- [ ] Performance: sync duration acceptable for tenant size.

---

## Decision Log
- 2026-04-22: Initial migration strategy drafted.
- 2026-04-22: Locked class source to Entra security groups.
- 2026-04-22: Locked auth rule to teacher group OR synced class group.
- 2026-04-22: Locked additive local admin with super-admin guard.
- 2026-04-22: Locked soft-remove, auto-reactivate, and historical-only inactive visibility.

---

## Current Overall Status
- Phase 0: `todo`
- Phase 1: `todo`
- Phase 2: `todo`
- Phase 3: `todo`
- Phase 4: `todo`
- Phase 5: `todo`
- Phase 6: `todo`

