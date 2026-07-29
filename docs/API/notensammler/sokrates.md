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

- **Before writing** — if the change lands on a hard-locked column/class and the
  caller is not the class lead or an admin, the request is rejected with
  **HTTP 423 Locked** and a German message. Unchanged values (re-saving the same
  grade) are never blocked.
- **After writing** — for a change on a *marked* semester, a `SokratesChangeNotice`
  is created and the class lead is emailed (best-effort via Microsoft Graph,
  `src/server/send-support-email-graph.ts`). A change made by the class lead
  themselves is ignored.

## Notifications

- `GET /api/notifications` — the signed-in teacher's notices (as a class lead),
  unacknowledged first. Returns `{ notifications, unreadCount }`.
- `POST /api/notifications/acknowledge` — body `{ id }` for one or `{ all: true }`
  for all. Always scoped to the caller's own `recipientId`.

Surfaced in the UI by the bell in the top bar (`src/components/notification-bell.tsx`)
and by the amber "changed after Sokrates transfer" highlight on drifted cells in
the Notensammler grid.
