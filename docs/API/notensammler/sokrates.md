# Sokrates Transfer Marker & Lock API

Sokrates is the Austrian government Zeugnis system. **Wechselplan cannot write to
it** — Sokrates has no public API and no confirmed grade-import file, so the
Klassenleiter (class lead) types the grades in by hand.

That manual step is the problem this feature solves: once a class lead has
entered a class's grades into Sokrates, a subject teacher who later changes a
grade in Wechselplan creates a silent divergence — the Zeugnis in Sokrates no
longer matches. These endpoints let the class lead **mark** a class+semester as
"entered into Sokrates", which **closes the class**: marking sets `lockedAll`, so
every teacher's column and the Zeugnisnoten become read-only for everyone except
the class lead and admins.

The lead can lift that blanket lock afterwards (`lock` with
`scope: 'all', locked: false`) without withdrawing the mark. That drops the
semester into the **soft** mode: teachers may change grades again, each change is
recorded and reported to the lead (in-app bell + email), and individual subject
columns can still be locked one at a time.

Server logic lives in `src/lib/sokrates-lock.ts`; enforcement is wired into the
grade-save routes (`/api/notensammler/grades`, `/api/notensammler/grades/batch`)
and the final-grade routes (`/api/notensammler/final-grades`,
`/api/notensammler/final-grades/batch`).

`/api/notensammler/transfer` is deliberately **not** blocked: it reads local
grades and pushes them to the external Notenmanagement system, writing nothing in
Wechselplan, so a frozen class can still be exported.

## Data model

- `SokratesTransfer` — one row per `(classId, semester, schoolYearId)`. Holds
  `markedById` / `markedByName` / `markedAt` and `lockedAll`.
- `SokratesSubjectLock` — a hard-locked single teacher/subject column under a
  transfer.
- `SokratesChangeNotice` — audit + notification record: one row per grade changed
  after the mark. Names are point-in-time snapshots. `recipientId` is the class
  lead notified; `acknowledgedAt` marks it resolved.

## Access

All routes require the **staff** tier (teacher or admin), enforced by
`denyUnlessAccess('staff')` and the middleware policy table. Mutating routes
additionally require the caller to be the class's `classLead` **or** an admin
(`canManageSokrates`). Reading status is open to any staff member — the grid
needs it to disable locked cells for everyone.

That check is only as strong as the `classLead` assignment behind it. Setting a
class's lead (`PATCH /api/classes/{id}`, and the `/class-settings` page) is
therefore **admin-only**: while it was staff-writable, any teacher could appoint
themselves lead of any class and lock every colleague out of it.

---

## GET `/api/notensammler/sokrates`

Per-semester mark/lock state for a class, plus whether the caller may manage it
and which cells have drifted (unresolved changes since the mark).

**Query:** `classId` (required), `schoolYearId` (optional; defaults to current).

**200 Response:**

```jsonc
{
  "status": {
    "first":  { "marked": true, "markedAt": "2026-02-01T09:00:00.000Z",
                "markedByName": "Anna Berger", "lockedAll": false,
                "lockedTeacherIds": [42], "transferId": 7 },
    "second": { "marked": false, "markedAt": null, "markedByName": null,
                "lockedAll": false, "lockedTeacherIds": [], "transferId": null }
  },
  "canManage": true,
  "driftedCells": ["101:42:first"]   // `${studentId}:${teacherId}:${semester}`
}
```

## POST `/api/notensammler/sokrates/mark`

Records that a class+semester has been entered into Sokrates **and hard-locks it
for every teacher** (`lockedAll: true`) in the same transaction. Re-marking an
already-marked semester refreshes `markedAt`, re-applies the lock **and
acknowledges all outstanding change notices** — the class lead has re-synced, so
the drift is resolved.

**Body:** `{ classId, semester: "first" | "second", schoolYearId? }`
**Auth:** class lead or admin. **403** otherwise.
**200:** `{ "success": true, "transferId": 7 }`

## POST `/api/notensammler/sokrates/unmark`

Removes the mark for a class+semester (cascades to its locks and notices).

**Body:** `{ classId, semester, schoolYearId? }` · **Auth:** class lead or admin.

## POST `/api/notensammler/sokrates/lock`

Adjust the lock a mark already applied. `scope: 'all', locked: false` releases
the blanket lock and leaves the semester in soft (notify-only) mode;
`scope: 'teacher'` locks or releases a single subject column, which only has an
effect while the blanket lock is off. Requires the class+semester to already be
marked.

**Body:**

```jsonc
{
  "classId": 3,
  "semester": "first",
  "schoolYearId": 1,          // optional
  "scope": "all" | "teacher", // whole class, or one column
  "teacherId": 42,            // required when scope === "teacher"
  "locked": true              // true = lock, false = unlock
}
```

**Auth:** class lead or admin. **400** if not yet marked.

---

## Enforcement in the grade-save routes

### Teacher grade columns

Both `POST /api/notensammler/grades` (single) and
`POST /api/notensammler/grades/batch` call into `sokrates-lock`:

- **Before writing** — a change that lands on a hard-locked column/class from a
  caller who is not the class lead or an admin is refused. The **single** route
  rejects with **HTTP 423 Locked**; the **batch** route ("Alle speichern")
  instead **skips** the locked rows, still persists everything else, and returns
  `{ success, count, skippedLocked }` so the client can warn. Unchanged values
  (re-saving the same grade) are never blocked by either route.
- **After writing** — for a change on a *marked* semester, a `SokratesChangeNotice`
  is created and the class lead is emailed (best-effort via Microsoft Graph,
  `src/server/send-support-email-graph.ts`). A change made by the class lead
  themselves is ignored.

### Zeugnisnoten (final grades)

`POST /api/notensammler/final-grades` and `/final-grades/batch` use
`isFinalGradeEditBlocked`. A final grade is class-wide, so there is no teacher
column to scope a per-subject lock to — **only `lockedAll` blocks it**, and a
lone `SokratesSubjectLock` does not. As with the grade routes, the single
endpoint rejects (**403**) and the batch endpoint skips the locked entries and
reports `{ success, count, skippedLocked }`.

The batch endpoint also mirrors each Endnote into the caller's *own* grade
column, and that half is additionally filtered by `isEditBlocked` — otherwise
saving an Endnote would be a way around a locked subject column.

## Notifications

The change notices reach the class lead through the shared in-app notification
channel — see [`../notifications/README.md`](../notifications/README.md) for the
endpoints and the data model. Sokrates raises five of its types:

- `sokrates-change` — grades moved after the mark. Addressed to the class lead;
  `count` is the number of notices still open, so it accumulates rather than
  being overwritten when entries collapse. Acknowledging it in the bell resolves
  those notices, which is what clears the drifted-cell highlight in the grid.
- `sokrates-marked` / `sokrates-unmarked` — sent to everyone holding a column in
  the sheet, because marking locks them out of it (and unmarking hands it back).
  Re-marking also marks any open `sokrates-change` entries read.
- `sokrates-locked` / `sokrates-unlocked` — `scope: 'all'` reaches every column
  owner, `scope: 'teacher'` only the one whose column moved.

The email to the class lead (best-effort via Microsoft Graph) is the redundant
channel and is unchanged: it is the one that reaches someone who is not logged in.
