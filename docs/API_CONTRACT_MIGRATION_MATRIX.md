# API Contract Migration Matrix

## Contract Target (Phase 1)

### Success shape
- `GET`: `{ "data": ... }`
- `POST` create: `201` + `{ "data": ..., "message"?: string }`
- `PUT/PATCH`: `200` + `{ "data": ..., "message"?: string }`
- `DELETE`: `200` + `{ "data": null, "message": string }`

### Error shape
```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

### Status policy
- `400` malformed input
- `404` not found
- `409` conflict/unique violation
- `422` semantic validation
- `500` internal error

---

## Wave 1: Core CRUD + Shared Data Layer

| Route | Current (observed) | Target contract | Priority | Notes |
|---|---|---|---|---|
| `src/app/api/admin/data/route.ts` | Mixed raw arrays/objects, `{ error: string }`, mostly `200/500` | Full target envelope + proper `201/404/409/422` mapping | P0 | Biggest downstream impact |
| `src/app/api/students/route.ts` | Mixed response + status usage | `{ data }` for reads, `201` on create, unified error object | P0 | UI depends heavily |
| `src/app/api/teachers/route.ts` | Mixed response + status usage | Same as above | P0 | UI depends heavily |
| `src/app/api/classes/route.ts` | Mixed response + status usage | Same as above | P0 | Class workflows central |
| `src/app/api/rooms/route.ts` | Likely mixed | Same as above | P1 | Straightforward normalization |
| `src/app/api/subjects/route.ts` | Likely mixed | Same as above | P1 | Straightforward normalization |
| `src/app/api/learning-contents/route.ts` | Likely mixed | Same as above | P1 | Straightforward normalization |

---

## Wave 2: Settings Endpoints

| Route | Current (observed) | Target contract | Priority | Notes |
|---|---|---|---|---|
| `src/app/api/settings/holidays/route.ts` | Mixed create/delete semantics, inconsistent errors | Standard envelopes, `201` on create | P1 | Align with `[id]` route |
| `src/app/api/settings/holidays/[id]/route.ts` | Not-found may bubble to `500` | Explicit `404` + standard errors | P1 | Common UI pain point |
| `src/app/api/settings/break-times/route.ts` | Mixed statuses | Standard envelope + `201` | P1 |  |
| `src/app/api/settings/break-times/[id]/route.ts` | Not-found handling inconsistent | Explicit `404`, no raw prisma errors | P1 |  |
| `src/app/api/settings/schedule-times/route.ts` | Mixed statuses | Standard envelope + `201` | P1 |  |
| `src/app/api/settings/schedule-times/[id]/route.ts` | Not-found handling inconsistent | Explicit `404`, standard errors | P1 |  |

---

## Wave 3: Scheduling APIs

| Route | Current (observed) | Target contract | Priority | Notes |
|---|---|---|---|---|
| `src/app/api/schedules/route.ts` | Mixed response structure | Standard envelopes | P1 | Core schedule flow |
| `src/app/api/schedules/data/route.ts` | Mixed domain payloads/errors | Wrap in `{ data }`, stable error object | P1 | Used by multiple screens |
| `src/app/api/schedules/assignments/route.ts` | Likely mixed | Standard envelopes + status mapping | P1 |  |
| `src/app/api/schedules/teacher-assignments/route.ts` | Likely mixed | Standard envelopes + status mapping | P1 |  |
| `src/app/api/schedules/notify-teachers/route.ts` | May return success despite partial failures | Return result summary in `{ data }`; optional `207` strategy or explicit failed count in `200` | P2 | Define policy clearly |

---

## Cross-Cutting Refactor Tasks

- [x] Add shared API response helpers (`ok`, `created`, `badRequest`, `notFound`, `conflict`, `unprocessable`, `serverError`)
- [x] Add shared error code enum (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE`, `INTERNAL_ERROR`)
- [ ] Map Prisma errors centrally (P2002 -> `409`, not-found -> `404`)
- [ ] Remove mixed top-level response keys (`message`/`success` without `data`)
- [ ] Ensure all create routes use `201`
- [ ] Ensure all list/read routes return `{ data: [...] }` or `{ data: {...} }`

## Progress Log

- 2026-05-06: Created matrix and shared helper `src/lib/api-response.ts`.
- 2026-05-06: Migrated `src/app/api/students/route.ts` to contract helper + `201` on create.
- 2026-05-06: Migrated `src/app/api/teachers/route.ts` to contract helper + `201` on create.
- 2026-05-06: Migrated `src/app/api/classes/route.ts` GET to `{ data }` envelope.
- 2026-05-06: Migrated `src/app/api/admin/data/route.ts` to contract helper (`ok/created/badRequest/serverError`), added model/id validation, and removed catch-path body re-read.
- 2026-05-06: Migrated `src/app/api/rooms/route.ts`, `src/app/api/subjects/route.ts`, and `src/app/api/learning-contents/route.ts` GET handlers to `{ data }` envelope + structured error response.
- 2026-05-06: Migrated `src/app/api/settings/holidays/route.ts` and `src/app/api/settings/holidays/[id]/route.ts` to contract helper, including `201` on create and `404` handling for missing deletes.
- 2026-05-06: Migrated `src/app/api/settings/break-times/route.ts` + `[id]` and `src/app/api/settings/schedule-times/route.ts` + `[id]` to contract helper with `201` creates, structured errors, and `404` handling for missing deletes.
- 2026-05-06: Migrated Wave 3 scheduling routes `src/app/api/schedules/route.ts`, `src/app/api/schedules/data/route.ts`, `src/app/api/schedules/assignments/route.ts`, `src/app/api/schedules/teacher-assignments/route.ts`, and `src/app/api/schedules/notify-teachers/route.ts` to standardized contract responses.
- 2026-05-06: Added response-shape compatibility updates in major frontend consumers (`use-cached-data`, `class-settings`, schedule creation/overview hooks/pages) to support `{ data: ... }` envelopes from migrated routes.
- 2026-05-06: Updated route tests for new contract semantics (`{ data }` envelope, structured error object, and revised status codes) and verified targeted suites pass.
- 2026-05-06: Performed broader API test sweep and aligned additional contract-affected suites (`classes`, `rooms`, `subjects`, `learning-contents`, `students`, `students/all`, `settings/break-times`, `settings/schedule-times`) to new response/status conventions.
- 2026-05-06: Refactored `students/all`, `students/class`, `teachers/by-username`, `school-years`, and `schedules/all` endpoints to shared contract helpers and updated route tests for student endpoints.
- 2026-05-06: Migrated admin settings leftovers to contract helper (`settings/holidays/bulk`, `admin/settings/break-times`, `admin/settings/schedule-times`, `admin/settings/import`) and updated associated tests.
- 2026-05-06: Migrated export endpoints (`export`, `export/schedule-dates`) to structured error responses and updated tests with `schoolYear`/membership-aware mocks.
- 2026-05-06: Migrated `user-roles` route handlers to shared contract helpers, including `403` forbidden envelopes and standardized delete success payload.
- 2026-05-06: Migrated class and scheduling utility endpoints (`classes/combine`, `classes/get-by-name`, `classes/[id]`, `roles`, `schedules/pdf-data`, `schedules/rotation`, `schedules/times`) to standardized envelopes and helper-based status mapping.
- 2026-05-06: Migrated admin sync endpoints (`admin/class-sync/apply`, `admin/class-sync/preview`, `admin/directory-sync-settings`) to standardized `{ data }` success envelopes and structured error payloads.
- 2026-05-06: Migrated additional admin endpoints (`admin/entra/groups`, `admin/ldap-config`, `admin/teachers/sync/apply`, `admin/teachers/sync/preview`, `admin/student-photos/o365-refresh`, `admin/student-photos/upload`, `admin/teacher-photos/o365-refresh`) to shared API contract helpers.
- 2026-05-06: Migrated grade/admin/auth utility endpoints (`admin/grades/export`, `admin/grades/import`, `auth/ldap-config`, `entitlements`, `entitlements/health`, `github/releases`) to shared helper-based success/error envelopes.
- 2026-05-06: Migrated export/profile endpoints (`export/excel`, `export/notenliste`, `me/photo`) to standardized helper-based error responses while preserving binary response behavior.
- 2026-05-06: Migrated first `noten` batch (`noten/auto-select`, `noten/conduct`, `noten/data`, `noten/entries`) to shared response helpers and standardized envelope/error shapes.
- 2026-05-06: Migrated second `noten` batch (`noten/final-grades`, `noten/lehrstoff`, `noten/search`, `noten/set-attendance-day`) to shared response helpers and standardized error payloads.
- 2026-05-06: Completed remaining `noten` endpoints (`noten/student-sitzplatz`, `noten/students`, `noten/teacher-classes`, `noten/teaching-days`, `noten/transfer-prefill`, `noten/weights`) with shared helper-based contract responses.
- 2026-05-06: Migrated core `notensammler` endpoints (`notensammler/class/[id]`, `notensammler/final-grades`, `notensammler/final-grades/batch`, `notensammler/grades`, `notensammler/grades/batch`, `notensammler/teacher-classes`) to shared response helpers and structured error envelopes.
- 2026-05-06: Migrated remaining `notensammler` transfer/export endpoints (`notensammler/pdf`, `notensammler/pdf/all`, `notensammler/transfer`, `notensammler/transfer/preview`, `notensammler/transfer/view`) to shared contract helpers for structured success/error envelopes.
- 2026-05-06: Migrated student/teacher utility endpoints (`students/photo`, `students/photo/check`, `students/[id]/transfer`, `students/import`, `students/import/save`, `teachers/photo`, `teachers/photo/check`, `teachers/import`, `teachers/import/save`) to helper-based success/error envelopes (binary photo/csv streaming behavior preserved).
- 2026-05-06: Migrated `support` endpoint to helper-based contract responses (`badRequest`, `created`, `serverError`) with consistent structured error envelopes.
- 2026-05-06: Removed remaining raw `NextResponse.json` branches from `notensammler/grades` (POST/DELETE) to fully align with helper-based error/success envelopes.
- 2026-05-06: Removed remaining raw `NextResponse.json` usage from API routes (`notensammler/transfer`, `notensammler/transfer/view`, `github/releases`), completing helper-envelope standardization for all JSON API responses.
- 2026-05-07: Student group source cleanup: `Student.groupId` and `GroupAssignment` removed in favor of `StudentWeekdayGroup`; scheduling/noten/notensammler/export/student-transfer read-write paths aligned to weekday-scoped group membership.

---

## Test Tracking (Contract Assertions)

| Route Group | Status | Required assertions |
|---|---|---|
| Core CRUD | TODO | success envelope shape, status codes, error object shape |
| Settings | TODO | `404` behavior, `201` on create, validation failures as `422`/`400` |
| Schedules | TODO | consistent envelope, partial-failure behavior on notifications |

---

## Definition of Done (Phase 1)

- [ ] All Wave 1-3 routes return standardized success/error envelopes
- [ ] Status codes follow policy
- [ ] No route returns raw internal error details
- [ ] Route tests assert contract (not just "status is ok")
- [ ] Frontend consumers can parse one predictable shape
