# Sokrates Transfer Marker & Lock API

Sokrates is the Austrian government Zeugnis system. **Wechselplan cannot write to
it** — Sokrates has no public API and no confirmed grade-import file, so the
Klassenleiter (class lead) types the grades in by hand.

That manual step is the problem this feature solves: once a class lead has
entered a class's grades into Sokrates, a subject teacher who later changes a
grade in Wechselplan creates a silent divergence — the Zeugnis in Sokrates no
longer matches. These endpoints let the class lead **mark** a class+semester as
"entered into Sokrates" and, from that point on, either

- **soft mark** (default): teachers may still change grades, but each change is
  recorded and the class lead is notified (in-app bell + email), or
- **hard lock** (hybrid escalation): the whole class or a single subject column
  is made read-only for everyone except the class lead / admin.

Server logic lives in `src/lib/sokrates-lock.ts`; enforcement is wired into the
grade-save routes (`/api/notensammler/grades` and `/api/notensammler/grades/batch`).

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

Records that a class+semester has been entered into Sokrates. Re-marking an
already-marked semester refreshes `markedAt` **and acknowledges all outstanding
change notices** — the class lead has re-synced, so the drift is resolved.

**Body:** `{ classId, semester: "first" | "second", schoolYearId? }`
**Auth:** class lead or admin. **403** otherwise.
**200:** `{ "success": true, "transferId": 7 }`

## POST `/api/notensammler/sokrates/unmark`

Removes the mark for a class+semester (cascades to its locks and notices).

**Body:** `{ classId, semester, schoolYearId? }` · **Auth:** class lead or admin.

## POST `/api/notensammler/sokrates/lock`

Hybrid escalation: turn a soft mark into a hard lock (or release it). Requires
the class+semester to already be marked.

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

## Notifications

The change notices reach the class lead through the shared in-app notification
channel — see [`../notifications/README.md`](../notifications/README.md) for the
endpoints and the data model. Sokrates raises five of its types:

- `sokrates-change` — grades moved after the mark. Addressed to the class lead;
  `count` is the number of notices still open, so it accumulates rather than
  being overwritten when entries collapse. Acknowledging it in the bell resolves
  those notices, which is what clears the drifted-cell highlight in the grid.
- `sokrates-marked` / `sokrates-unmarked` — sent to everyone holding a column in
  the sheet, because from that moment their edits are either blocked or reported.
  Re-marking also marks any open `sokrates-change` entries read.
- `sokrates-locked` / `sokrates-unlocked` — `scope: 'all'` reaches every column
  owner, `scope: 'teacher'` only the one whose column moved.

The email to the class lead (best-effort via Microsoft Graph) is the redundant
channel and is unchanged: it is the one that reaches someone who is not logged in.
