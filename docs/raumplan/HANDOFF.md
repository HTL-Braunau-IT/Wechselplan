# Handoff — Raumplan (room-occupancy view)

A build spec for a fresh agent. Everything decided with the user is captured here so you
don't need the prior conversation. Read this top-to-bottom, then follow **Build sequence**.

Design mockup (interactive, shows the target UX): the user has a published artifact titled
**"Raumplan-Entwurf"** — ask them for the link if you need it. It is a *mockup with demo
data*, not the implementation. This document is the source of truth for behaviour.

---

## 1. Objective

Add a **Raumplan** ("room plan") feature to the Wechselplan app: a read-only view that shows,
per workshop room, **which teacher is there on which weekday / half-day**, rendered on a
**floor plan** of the workshop, plus a **matrix** and a **student "where should I be?"** view.
Two audiences: staff (full overview) and students (their own group's room for a given day).

This is essentially a **re-pivot of data that already exists** — no new capture of who-is-where.

---

## 2. Decisions (locked with the user)

| Topic | Decision |
|---|---|
| Granularity | **Weekday × half-day (AM/PM = Vormittag/Nachmittag)**. No clock times — the data has none. |
| Rotation | Groups rotate through rooms each Turnus. A teacher's room varies by AM/PM and weekday (some teachers fixed, some not). Working invariant, **confirmed by user**: `(teacher, weekday, period) → exactly one room`. |
| Floor plans | **1:1 traced** from the clean source, three levels. Provided as SVG (see §5). |
| Room scope | Every DB room gets a box; rooms with no assignment this year shown **hatched (Schraffur)**. |
| Audience | Staff **and** students, **read-only** (no editing of bookings here). |

---

## 3. Data model reality (already in the schema)

All in `prisma/schema.prisma`. No schema change is required for the core feature.

- **`Room`** — seeded (~51 rooms) in `prisma/seed.ts` (~line 284). `name` is unique.
- **`TeacherAssignment`** (schema ~line 285) — the base binding, per school year:
  `classId + period("AM"|"PM") + groupId + selectedWeekday(1–5) → teacherId, subjectId,
  learningContentId, **roomId**`. Unique on `[classId, period, groupId, schoolYearId, selectedWeekday]`.
  Read example: `src/app/api/schedules/teacher-assignments/route.ts` (GET groups by AM/PM, includes
  `teacher, subject, learningContent, room`).
- **`TeacherRotation`** (schema ~line 395) — rotates the **teacher** per Turnus:
  `classId + groupId + **turnId** + period + selectedWeekday → teacherId`. **No roomId.**
- **`ScheduleTurn`** / **`ScheduleWeek`** (schema ~line 229) — map a **date → Turnus**
  (`ScheduleWeek.date` is `"dd.MM.yy"`, belongs to a `ScheduleTurn`; turn has `period` + `order`).
- **`Student.groupId`** is the source of truth for group membership (see `docs/ARCHITECTURE.md`).
- `SchoolYear` scopes records; resolve via `src/lib/school-year.ts` (`resolveSchoolYearId`).

**First task before coding**: verify the resolution invariant against the live/seeded DB
(`npm run db:seed:local`). Confirm that for a given `(teacherId, selectedWeekday, period,
schoolYearId)` there is exactly one distinct `roomId` in `TeacherAssignment`. If that holds,
the algorithm in §4 is correct. If not, escalate to the user — it changes the model.

---

## 4. Occupancy resolution

**Room-centric (staff view), for a room R on (weekday, period):**
- The **teacher** is effectively fixed across the year: find the `TeacherAssignment` rows with
  that `roomId + selectedWeekday + period + schoolYearId` → teacher + subject + learningContent.
- Which **group** is physically present depends on the Turnus of the chosen date:
  resolve date → Turnus (`ScheduleWeek`), then `TeacherRotation(class, group, turnId, weekday,
  period)` tells you which group maps to that teacher this Turnus.
- A room with **no** `TeacherAssignment` in the school year → render **hatched (nicht genutzt)**.

**Student-centric ("where should I be?"), for student S on date D:**
1. `S.groupId` → group + class.
2. `D` → Turnus via `ScheduleWeek`.
3. For each period (AM, PM): `TeacherRotation(class, group, turnId, weekday, period)` → `teacherId`.
4. `TeacherAssignment(teacherId, weekday, period, schoolYear)` → **room** + subject + teacher name.
   (This is where the `(teacher, weekday, period) → one room` invariant is used.)

Reuse existing resolution building blocks where possible — `src/app/api/schedules/data/route.ts`
already assembles per-teacher `assignments + rotation + schedules + students` and is the closest
precedent for combining these tables.

---

## 5. Assets provided (in `docs/raumplan/assets/`)

Three **1:1 traced floor plans** as standalone SVGs, plus their generators:

- `eg-elektrische-werkstaette.svg` — Erdgeschoss · Elektrische Werkstätte (E74, E77, E79–E86, E89 + context)
- `eg-mechanische-werkstaette.svg` — Erdgeschoss · Mechanische Werkstätte (E42–E48, E56/E57, E61–E66, E68/68a/68b, E69, E72, E78a + context)
- `og1-elektrische-werkstaette.svg` — 1. Stock (142–149)
- `gen-eg-elektro.mjs`, `gen-eg-mechanik.mjs`, `gen-og1-elektro.mjs` — the generators (edit these, `node gen-*.mjs`, to correct geometry/labels).
- `gen-artifact-plans.mjs` — emits **theme-able fragments** (classes only, no inline colors, no `<style>`), the form to embed in the React components.

**SVG contract (critical):**
- Every teaching room is a `<g class="room room--db" data-room="<Room.name>">` — `data-room`
  matches `Room.name` **exactly** (e.g. `E83`, `146`, `B&R`, `146/E68`). Bind occupancy and
  click handlers by this attribute.
- Non-teaching rooms are `class="room room--ctx"` (Turnsaal, WC, Zentrallager, E75, E87, …) —
  muted, non-interactive, for orientation only.
- `.gang` = hallway, `.hof` = courtyard, `.door-gap`/`.door-line` = doors, `.r-name`/`.r-label`
  = labels, `.room-box` = the room rectangle. Colour everything via **CSS custom properties /
  the app theme**, not the inline colours from the standalone SVGs.
- Occupancy states to style: `.is-occupied` (belegt, green), `.is-unused` (hatched, needs a
  `<pattern id="hatch">`), `.is-selected` (accent outline). See the artifact's CSS for a working
  reference set of these rules.

**Geometry is a faithful first trace, not surveyed** — the user may still correct room
positions/labels by editing the generators. Treat the SVGs as authoritative for topology and
room identity; expect small geometry tweaks.

---

## 6. Room ↔ level map & open questions

DB rooms found on the three plans:
- **EG Elektro**: E74, E77, E79, E80, E81, E82, E83, E84, E85, E86, E89
- **EG Mechanik**: E42, E43, E45, E46, E47, E48, E56, E57, E61, E62, E63, E64, E65, E66, E68, E68a, E68b, E69, E72, E78a
- **1. Stock**: 142, 143, 144, 145, 146, 147, 148, 149

**DB rooms NOT on any workshop plan** (resolve with user before shipping — assign a level or
remove from `Room`): `E02, E03, E17, E31, E33, E37, E73, E76, E78, EDV 1, EDV 2, EDV 3, B&R,
146/E68`. Keller (K-rooms) and upper class floors exist in the source PDF but hold no DB rooms.

**Open with user**: should non-DB plan rooms (E75 Tonstudio, E87 Aufenthaltsraum, E90+91,
Turnsäle, E55 Zentrallager …) become real `Room` records, or stay grey context? Current SVGs
have them as context (`room--ctx`).

---

## 7. Proposed architecture

Follow the repo's conventions (`CLAUDE.md`): REST route handlers under `src/app/api/**/route.ts`,
shared logic in `src/lib/**`, client via `fetch`/hooks, access rules in `src/lib/api-access.ts`
+ guards in handlers. **Do not reintroduce tRPC.**

- **Route/page**: `src/app/raumplan/page.tsx` — a new tab with three views (Grundriss / Matrix /
  Schüler). Add nav entry where other tabs are registered.
- **API**: `GET /api/raumplan?date=<dd.MM.yy>&period=<AM|PM>&schoolYearId=?` — resolves the
  Turnus for `date`, returns per-room occupancy `{ room, teacher?, subject?, group?, state:
  'occupied'|'free'|'unused' }[]`. A second endpoint (or query param) for the student view keyed
  by the caller's student/group. Put resolution logic in `src/lib/raumplan/*.ts`, not the handler.
- **Access** (`src/lib/api-access.ts` — most-specific-prefix-first, default `staff`): staff sees
  full overview; students see their own group's rooms. If students must reach it, add an explicit
  `session`-tier rule and enforce ownership in the handler (a student may only resolve their own
  group). Wire the handler guard too (`api-guard.ts`) — defence in depth. Update `docs/API/`.
- **Floor-plan component**: render the chosen level's SVG inline (from the `gen-artifact-plans.mjs`
  fragment form), map API occupancy onto `[data-room]` nodes, handle click → detail panel.
  Three levels = three switchable SVGs (EG Elektro / EG Mechanik / 1. Stock).
- **i18n**: all UI strings via i18next catalogue (German primary). Room *purposes* can come from
  the plan labels; consider storing them on `Room.description` (already exists) via a one-off
  script rather than hardcoding.

---

## 8. Views to build

1. **Grundriss** — level switcher (EG Elektro / EG Mechanik / 1. Stock) + day tabs (Mo–Fr) +
   half-day (VM/NM) + Turnus selector. Rooms coloured: belegt (teacher+group on click) / frei /
   hatched. Context rooms muted. This is the primary view.
2. **Raum-Matrix** — rooms (rows) × (weekday, VM/NM) (cols), cell = teacher + group/subject.
3. **Schüler-Ansicht** — pick student/group (or "today"), show VM room + NM room with teacher,
   subject, and which level/zone. Optionally a week overview.

The published artifact demonstrates all three with demo data — mirror that UX, wire real data.

---

## 9. Build sequence

1. Verify the `(teacher, weekday, period) → one room` invariant against the DB (§3). Escalate if false.
2. `src/lib/raumplan/resolve.ts` — pure functions: `date→turnus`, `roomOccupancy(weekday, period,
   turnus, schoolYear)`, `studentWhereAmI(studentId, date)`. Unit-test in `node` (vitest).
3. `GET /api/raumplan` handler(s) + access rule + handler guard + `docs/API/raumplan/README.md`.
   Add a route-guard test (see `src/app/api/__tests__/route-guards.test.ts`).
4. Floor-plan SVG component(s) from the fragments (§5), theme-aware, `[data-room]` binding.
5. `src/app/raumplan/page.tsx` with the three views + a `use-raumplan` hook (`src/hooks/`).
6. Populate room purposes (optional): script to set `Room.description` from the plan labels.
7. Resolve the off-plan rooms question (§6) with the user.
8. `npm run check` (eslint + tsc) — the gate — plus `npx vitest run`. Optionally drive it with
   the Playwright harness (see `CLAUDE.md` → e2e).

---

## 10. Conventions (from CLAUDE.md — do not skip)

- Formatting: prettier is authoritative — single quotes, **no semicolons**, `arrowParens: avoid`,
  `printWidth: 100`, trailing commas. Import alias `@/*` → `src/*`.
- Gate before commit: `npm run check`. Tests: vitest (`node` for lib/route, jsdom docblock for
  components). `@/lib/api-guard` is globally mocked to "allowed" in tests.
- New API routes are protected by default (unmatched → `staff`); always add the rule **and** the
  handler guard.
- Grades/rotation domain terms are German; keep shared rules factored in `src/lib/**`.
- Git: don't commit/push unless asked; branch off `main` first; no Claude attribution in messages.

---

## 11. References

- `prisma/schema.prisma` — Room, TeacherAssignment, TeacherRotation, ScheduleTurn/Week.
- `prisma/seed.ts` (~line 284) — the seeded room list.
- `src/app/api/schedules/teacher-assignments/route.ts` — assignment read pattern.
- `src/app/api/schedules/data/route.ts` — combined assignments + rotation + students (closest precedent).
- `src/lib/api-access.ts`, `src/lib/api-guard.ts`, `src/middleware.ts` — access control.
- `docs/raumplan/assets/` — the three floor-plan SVGs + generators (this feature's visual source).
- Source floor plan: `Lageplan_Gesamt 2.pdf` (clean vector; workshop pages are the Erdgeschoss
  "Elektrische/Mechanische Werkstätte" and "1. Stock" pages).
