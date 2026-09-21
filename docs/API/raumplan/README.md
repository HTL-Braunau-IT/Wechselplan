# Raumplan API

Room-occupancy view: which teacher is in which workshop room on which weekday /
half-day, re-pivoted from the existing schedule/rotation tables. **Read-only** —
no bookings are created or edited here.

Resolution logic lives in `src/lib/raumplan/` (pure resolvers in `resolve.ts`,
Prisma access in `query.ts`); the handlers are thin. See
`docs/raumplan/HANDOFF.md` for the design decisions and the data model.

## Access

Both endpoints are **`staff`** tier (`src/lib/api-access.ts`,
`{ prefix: '/api/raumplan', tier: 'staff', methods: ['GET'] }`) and each handler
guards itself with `denyUnlessAccess('staff')`. They return full rosters and
room bindings across the workshop, the same sensitivity as `/api/schedules/data`.

> **Student self-view.** `GET /api/raumplan/me` (`session`-tier, below) is the
> student-facing endpoint: it is self-scoped — the `Student` is resolved from the
> session via `resolveSessionStudent`, never a query param — so any signed-in user
> may reach it and only ever sees their own room. `GET /api/raumplan/student`
> (staff, takes a `studentId`) remains the staff picker.

## `GET /api/raumplan`

Full Mon–Fri × AM/PM occupancy grid for a week. The Grundriss and Matrix views
derive their data client-side by filtering the returned cells.

Query params:

| param          | required | notes                                                          |
| -------------- | -------- | -------------------------------------------------------------- |
| `week`         | no       | Any date in the target week, `"dd.MM.yy"`. Defaults to today.  |
| `schoolYearId` | no       | Defaults to the current/latest school year.                    |
| `check`        | no       | `invariant` → return invariant violations instead of the grid. |

Response (`200`):

```jsonc
{
  "schoolYearId": 1,
  "reference": "15.09.25",
  "weekDates": {
    "1": "15.09.25",
    "2": "16.09.25",
    "3": "17.09.25",
    "4": "18.09.25",
    "5": "19.09.25",
  },
  "cells": [
    {
      "roomName": "E83",
      "level": "eg-e", // eg-e | eg-m | og1 | null (not on a plan)
      "state": "occupied", // occupied | free | unused
      "period": "AM",
      "weekday": 1,
      "teacherName": "Alice A",
      "subjectName": "Infotech",
      "groups": [{ "classId": 10, "className": "1AHET", "groupId": 2 }],
    },
    // … one cell per room × weekday × period
  ],
}
```

- `unused` — the room has **no** `TeacherAssignment` this school year (rendered
  hatched / Schraffur).
- `free` — used elsewhere this year, but no teacher on this weekday/period slot.
- `occupied` — a teacher is fixed here for the slot; `groups` are the group(s)
  rotated in for the resolved Turnus of that date.

With `?check=invariant`:

```jsonc
{
  "schoolYearId": 1,
  "violations": [
    {
      "teacherId": 1,
      "teacherName": "Alice A",
      "weekday": 1,
      "period": "AM",
      "roomNames": ["E82", "E83"],
    },
  ],
}
```

An empty `violations` array confirms the working invariant
`(teacher, weekday, period) → exactly one room` (HANDOFF §3, build step 1).

Errors: `400` if no school year resolves; `500` on an unexpected failure.

## `GET /api/raumplan/student`

"Where should I be?" for one student on a date.

Query params:

| param          | required | notes                                       |
| -------------- | -------- | ------------------------------------------- |
| `studentId`    | **yes**  | Integer.                                    |
| `date`         | no       | `"dd.MM.yy"`. Defaults to today.            |
| `schoolYearId` | no       | Defaults to the current/latest school year. |

Response (`200`):

```jsonc
{
  "student": { "id": 7, "name": "Max Mustermann", "className": "1AHET", "groupId": 1 },
  "date": "15.09.25",
  "weekday": 1,
  "periods": [
    {
      "period": "AM",
      "state": "placed", // placed | none
      "roomName": "E84",
      "level": "eg-e",
      "teacherName": "Bob B",
      "subjectName": "Sigmatec",
      "learningContentName": "…",
      "groupId": 1,
      "turnName": "TURNUS 2", // null when the date is in no week
    },
    {
      "period": "PM",
      "state": "none",
      "roomName": null,
      "level": null,
      "teacherName": null,
      "subjectName": null,
      "learningContentName": null,
      "groupId": null,
      "turnName": null,
    },
  ],
}
```

Errors: `400` (missing/invalid `studentId` or no school year), `404` (student not
found or has no class), `500` (unexpected).

## `GET /api/raumplan/me`

The **signed-in student's own** room for today, or the next workshop day when
today has nothing. `session`-tier and self-scoped: the `Student` is resolved from
the session (`resolveSessionStudent`), never a param. A signed-in user who is not
a student (or matches no `Student`) gets `404`. Powers the room highlight on the
student home page.

Query params: `date` (optional `"dd.MM.yy"`, defaults today), `schoolYearId`.

Response (`200`) — same period shape as `/student`, plus a day resolution:

```jsonc
{
  "student": { "id": 7, "name": "Max Mustermann", "className": "1AHET", "groupId": 1 },
  "date": "22.09.25", // the resolved day (may be later than today)
  "weekday": 1,
  "isToday": true, // false → date is the next workshop day
  "hasUpcoming": true, // false → no scheduled day found in the search window (~4 weeks)
  "periods": [
    /* StudentPlacementPeriod[], AM then PM — same fields as /student */
  ],
}
```

The forward search treats a day as "scheduled" only when a period is `placed` in
a real Turnus week (`turnName != null`) — a base assignment resolving a room on
the class's weekday outside any meeting week does not count.

Errors: `400` (no school year), `404` (no student for the session), `500`.

## Turnus / date resolution (important)

A calendar date maps to a Turnus **per class, per period lane**:
`ScheduleWeek.date` (`"dd.MM.yy"`) → its `ScheduleTurn` → `ScheduleTurn.name`,
which is what `TeacherRotation.turnId` (a **string label**, not an FK) matches.
`TeacherRotation` carries no room; the room follows the rotated **teacher** via
that teacher's `TeacherAssignment` for the slot (the invariant).
