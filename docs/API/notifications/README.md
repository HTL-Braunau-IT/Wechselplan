# Notifications API

In-app notifications — the bell in the top bar
(`src/components/notification-bell.tsx`).

The school's staff coordinate around two things that change under them without
warning: a Wechselplan they teach in, and a grade sheet they share. This is the
channel that tells them. It is deliberately in-app only; email is used for the
one case that has to reach someone who is not logged in (see
[`../notensammler/sokrates.md`](../notensammler/sokrates.md)).

## Data model

`Notification` — one row per recipient per `dedupeKey`, not per event: repeated
events with the same key refresh the recipient's existing unread row rather than
adding another (see [Collapsing](#collapsing)). Without a key, each event does
get its own row.

| Column        | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `recipientId` | `Teacher.id`. Cascades on delete.                                    |
| `type`        | One of `NOTIFICATION_TYPES` (`src/types/notifications.ts`).          |
| `params`      | Interpolation values for the message. **Never a rendered sentence.** |
| `link`        | In-app path opened when the row is clicked.                          |
| `actorId`     | Who triggered it; `null` for an admin with no `Teacher` row.         |
| `actorName`   | Point-in-time snapshot, so the row survives a rename.                |
| `dedupeKey`   | Collapse key — see below.                                            |
| `readAt`      | `null` while unread. Read rows are pruned after 90 days.             |

Storing `type` + `params` rather than text is what keeps a notification written
months ago readable in **both** languages: the message itself lives in
`public/locales/*/common.json` and is resolved at render time.
`src/types/__tests__/notifications.test.ts` fails CI if a type has no message,
or if the German and English wordings disagree about their placeholders.

The domain tables (`Schedule`, `Grade`, `SokratesChangeNotice`, …) remain the
record of what happened. This table is only the delivery channel.

### Collapsing

Writers pass a `dedupeKey`. If the recipient already has an **unread** row with
that key, it is refreshed — new type, new params, new timestamp — instead of a
second one being added. Without it, a teacher saving a grade sheet cell by cell
would bury the class lead's bell. A row that has been read is never collapsed
onto, so a fresh event after acknowledgement shows up as new.

The match deliberately ignores `type`, so different kinds of edit to the same
thing fold together: all four schedule types share the key
`schedule:<classId>:<schoolYearId>`, because walking the create wizard once
posts to three separate endpoints and a colleague wants one line about that
class rather than three, a minute apart. Keeping concerns apart is the key
prefix's job, not the type's.

Because a collapsed row is overwritten, its `params` describe the **most recent**
occurrence, which is why the timestamp moves with it. `sokrates-change` is the
exception: its `count` is re-read from the still-open notices, so it accumulates.

## Types

| Type                           | Recipients                               | Raised by                                 |
| ------------------------------ | ---------------------------------------- | ----------------------------------------- |
| `schedule-created`             | Class audience + plan authors            | `POST /api/schedules`                     |
| `schedule-updated`             | Class audience + plan authors            | `POST /api/schedules`                     |
| `schedule-assignments-changed` | …plus the previous assignment holders    | `POST /api/schedules/teacher-assignments` |
| `schedule-rotation-changed`    | …plus the previous rotation holders      | `POST /api/schedules/rotation`            |
| `schedule-students-changed`    | Class audience of the affected class(es) | times / group-assignments / transfer      |
| `grades-entered`               | The class's Klassenleiter                | `POST /api/notensammler/grades[/batch]`   |
| `sokrates-marked`              | Everyone with a column in the sheet      | `POST /api/notensammler/sokrates/mark`    |
| `sokrates-unmarked`            | Everyone with a column in the sheet      | `POST /api/notensammler/sokrates/unmark`  |
| `sokrates-locked`              | Whole sheet, or the one locked teacher   | `POST /api/notensammler/sokrates/lock`    |
| `sokrates-unlocked`            | Whole sheet, or the one unlocked teacher | `POST /api/notensammler/sokrates/lock`    |
| `sokrates-change`              | The class's Klassenleiter + the changer  | `src/lib/sokrates-lock.ts`                |
| `sokrates-change-acknowledged` | The teacher(s) who made the changes      | acknowledge (bell or rundown panel)       |

`schedule-students-changed` is raised whenever a class's roster or group layout
moves: `POST /api/schedules/times` (turn usage / breaks), `POST
/api/schedules/assignments` (group re-shuffle) and `POST
/api/students/[id]/transfer` (a student leaving one class and joining another —
both classes are notified). It shares the `schedule:<classId>:<schoolYearId>`
dedupe key with the other schedule types, so a burst of edits to one class stays
one bell line. Bulk directory sync does **not** raise it, to avoid a storm of
per-class rows on the nightly run.

`sokrates-change-acknowledged` closes the loop the issue asked for: when the
class lead acknowledges the post-Sokrates changes (from the bell or the
Notensammler rundown panel), each teacher whose edit was acknowledged gets one
row, so they know the lead has actually seen it. `count` is how many of *their*
changes were cleared.

"Class audience" is everyone holding a `TeacherAssignment` or `TeacherRotation`
in that class, plus its `classHead` and `classLead`. "Plan authors" are the
teachers recorded in `Schedule.createdById` — that column is what makes the
person who built a plan hear about someone else's edits to it.

Two rules apply to every type, in `src/lib/notifications.ts`:

- **The actor is never notified.** You do not need telling about your own edit.
- **Deactivated teachers are dropped.** Recipients are filtered through
  `teacher.findMany`, which defaults to `isActive: true`.

Writing a notification is best-effort throughout: the `_notify.ts` helpers next
to the routes wrap their whole body in `bestEffort`, **recipient lookups
included**. That last part matters — the lookups run after the mutation has
committed, so letting one throw would report a 500 for a schedule or grade save
that in fact succeeded, and the user would do it again.

---

## GET `/api/notifications`

The caller's own notifications, unread first then newest first, capped at 100.
Access tier: **staff**.

**200 Response:**

```jsonc
{
  "notifications": [
    {
      "id": 42,
      "type": "schedule-updated",
      "params": { "className": "1AHIT" },
      "link": "/schedules?class=1AHIT",
      "actorName": "Max Muster",
      "createdAt": "2026-07-29T09:12:00.000Z",
      "read": false,
    },
  ],
  "unreadCount": 1,
}
```

An admin with no `Teacher` row has no inbox and receives an empty list — not an
error.

The client ignores any `type` it does not recognise, so a tab left open across a
deploy shows one fewer row rather than a blank card.

---

## POST `/api/notifications/acknowledge`

Marks notifications read. Access tier: **staff**.

**Body:** `{ "id": 42 }` for one, or `{ "all": true }` for every unread one.
Either way the update is scoped to the caller's own `recipientId`, so an id
belonging to somebody else matches nothing.

**200 Response:** `{ "success": true, "count": 1 }`

**400** when the body has neither `id` nor `all`; **404** when the signed-in user
has no `Teacher` row.

### Side effect: Sokrates drift

Acknowledging a `sokrates-change` entry also resolves the underlying
`SokratesChangeNotice` rows for that class, semester and school year (again
scoped to the caller). Those rows are what the Notensammler grid reads to
highlight drifted cells, so dismissing the bell clears the grid markers too —
the two views would otherwise disagree about whether the drift had been handled.

The reverse direction is covered as well: re-marking a semester as entered into
Sokrates resolves the notices _and_ marks the matching bell entries read.

Acknowledging also **notifies the teachers back**: each subject teacher whose
change the lead just acknowledged gets a `sokrates-change-acknowledged` row
(`acknowledgeSokratesChangeNotices` in `src/lib/sokrates-lock.ts`, shared with
the rundown panel's endpoint below).

---

## GET `/api/notensammler/sokrates/changes?classId=&schoolYearId=`

The "what changed" rundown a grade notification links to. Access tier:
**staff**. Returns the still-open (unacknowledged) `SokratesChangeNotice` rows
for the class — student, subject column, old → new grade (already formatted),
who changed it and when. Scoped to the reader: the class lead sees every open
change in their class; a subject teacher sees only their own. `canAcknowledge`
is true only for the class lead.

```jsonc
{
  "changes": [
    {
      "id": 5,
      "studentName": "Berger Anna",
      "subjectTeacherName": "Max Muster",
      "oldGrade": "3",
      "newGrade": "2",
      "semester": "first",
      "changedByName": "Max Muster",
      "changedAt": "2026-07-29T09:12:00.000Z",
    },
  ],
  "canAcknowledge": true,
}
```

## POST `/api/notensammler/sokrates/changes/acknowledge`

The class lead's "Gesehen" action on the rundown panel. Access tier: **staff**,
but the handler additionally requires the caller to be the class lead
(`canManageSokrates`) — **403** otherwise. Body: `{ classId, schoolYearId?,
semester? }`; an absent `semester` acknowledges both. Marks the notices
acknowledged (clearing the grid drift markers), dismisses the lead's own
`sokrates-change` bell entry, and raises `sokrates-change-acknowledged` for the
teachers who made the changes.

**200 Response:** `{ "success": true, "count": 3 }`

---

## POST `/api/notifications/digest/run`

Unattended daily e-mail digest of unacknowledged notifications. Machine
endpoint: authenticated by the same shared secret as the directory-sync trigger
(`SYNC_TRIGGER_SECRET`, header `x-sync-secret` or `Authorization: Bearer …`),
declared `public` in `api-access.ts` so the session check does not reject the
cron caller. An external scheduler calls it once a day.

- **503** when `SYNC_TRIGGER_SECRET` is unset (feature stays off).
- **401** without the right secret.
- **200** `{ "skipped": true, "reason": "email digest disabled" }` when the admin
  master switch (`NotificationSettings.emailDigestEnabled`) is off.
- **200 / 207** `{ "skipped": false, "summary": { … } }` on a run — 207 if some
  sends failed.

Each teacher with in-app notifications left unread for more than 24 hours
(`DIGEST_AGE_HOURS`) gets one plain-text German summary of what they missed;
those rows are then stamped `digestedAt` so the same miss is never mailed twice
even while it stays unread. Deactivated teachers and those without an address are
skipped. The master switch lives under **Admin → Benachrichtigungen**
(`GET`/`PUT /api/admin/notification-settings`, admin-only).
