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

> **Student self-view (not yet built).** The "where should I be?" endpoint is
> staff-only for now, driven by a staff picker (HANDOFF §8.3). A student-facing
> self-view would need (a) a `session`-tier rule placed _before_ the `staff` rule
> (e.g. `{ prefix: '/api/raumplan/student', tier: 'session' }`), and (b) an
> ownership check in the handler resolving the caller's own `Student` from the
> session and rejecting any other `studentId`. There is currently no
> student-session → `Student` identity mapping in the app (teachers resolve via
> `Teacher.username`; students have no equivalent), which is why it is deferred.

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

## Turnus / date resolution (important)

A calendar date maps to a Turnus **per class, per period lane**:
`ScheduleWeek.date` (`"dd.MM.yy"`) → its `ScheduleTurn` → `ScheduleTurn.name`,
which is what `TeacherRotation.turnId` (a **string label**, not an FK) matches.
`TeacherRotation` carries no room; the room follows the rotated **teacher** via
that teacher's `TeacherAssignment` for the slot (the invariant).
