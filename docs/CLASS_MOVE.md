# What happens when a student moves class

Written 2026-07-29, while retiring LDAP. A student changing class mid-year is the most
common non-trivial directory event at this school, it touches nine tables, and until this
pass nothing in the codebase described what was supposed to happen. This is that
description, plus the two things that were actually broken.

There are two paths that move a student, and they did not agree with each other:

| | Trigger | Where |
|---|---|---|
| **Manual transfer** | An admin uses the transfer dialog and picks the destination group | `src/app/api/students/[id]/transfer/route.ts` |
| **Directory sync** | The student's Entra group membership changed; the nightly run notices | `src/lib/class-student-sync.ts` |

---

## The data model in one paragraph

`Student.classId` is the student's current class. `ClassMembership` is the same fact
scoped to a school year — one row per `(studentId, schoolYearId)` — and it is what the
grade pages read, so it is the historical record. `Student.groupId` is the rotation group
*within* the class: a small integer, 1..N, **numbered per class and unique to nothing**.
The set of groups a class has is `GroupAssignment`, keyed by the class **name** rather
than its id. Everything downstream — the rotation schedule, teacher assignments, grade
entry — addresses a cohort as the pair `(classId, groupId)`.

That `groupId` is a bare `Int` with no foreign key, and that `GroupAssignment` is keyed by
a name that Entra can change, are the two design choices every bug below comes out of.

---

## What each table does when a student moves from 1AHIT to 1BHIT

| Table | Keyed by | On a move | Correct? |
|---|---|---|---|
| `Student.classId` | — | Updated to the new class | ✅ |
| `ClassMembership` | `(studentId, schoolYearId)` | The single row for the year is **repointed** to the new class | ⚠️ see below |
| `Student.groupId` | — | **Was left untouched by sync** | ❌ fixed here |
| `GroupAssignment` | `(class name, groupId)` | Untouched | ✅ |
| `Grade` | `(studentId, teacherId, classId, semester, schoolYearId)` | Old rows stay under the old `classId` | ✅ deliberate |
| `FinalGrade` | `(studentId, classId, semester, schoolYearId)` | Same | ✅ deliberate |
| `NotenEntry` | `(studentId, teacherId, classId, groupId, schoolYearId, date, period)` | Same | ✅ deliberate |
| `NotenWeightConfig`, `LehrstoffPerDay` | `(teacherId, classId, groupId, …)` | Per-teacher-per-group config, not per student — unaffected | ✅ |
| `TeacherAssignment`, `TeacherRotation` | `(classId, groupId, …)` | Class-level, not per student — unaffected | ✅ |
| `NotenmanagementTransfer` | `(classId, groupId, semester, schoolYearId, nmKlasse)` | Class-level — unaffected | ✅ |
| `Schedule` | `classId` | The student now resolves against the new class's schedule | ✅ |

Historical grades deliberately do **not** follow the student. A grade is a statement about
work done in a particular class with a particular teacher, so it stays where it was
earned. The consequence, which is correct but worth saying out loud to whoever fields the
question: after a mid-year move, the student's first-semester grades are visible on
1AHIT's Notensammler sheet and their row on 1BHIT's sheet starts empty
(`src/app/api/notensammler/grades/route.ts` queries `where: { classId, schoolYearId }`).

### The `ClassMembership` caveat

`@@unique([studentId, schoolYearId])` means a student has exactly one class per school
year. A move rewrites that row, so after the move the year-scoped record says the student
was in 1BHIT all along. Grade *rows* still carry the old `classId` and survive, but any
view that starts from `ClassMembership` — the Noten student picker does
(`src/app/api/noten/students/route.ts`) — will no longer list them under the old class.
Changing this means allowing multiple memberships per year with date ranges; it is a real
schema change and out of scope here, but it is the reason a teacher may say "the student
vanished from my class list" while their grades are still in the database.

---

## Bug 1 — sync left the rotation group behind

`applyClassStudentSync` updated `classId` and `ClassMembership` and never touched
`groupId`. Because group numbers are per class, a student who was in group 2 of 1AHIT
arrived in 1BHIT still holding `groupId = 2` — silently placed in a cohort nobody assigned
them to. Three things follow from that, in increasing order of unpleasantness:

1. They appear in group 2's rotation on the printed schedule and in group 2's grade-entry
   sheet (`/api/noten/students?classId=…&groupId=2` filters on exactly this column).
2. Group sizes go out of balance with no trace of why.
3. If 1BHIT only runs two groups and the student carried `groupId = 3`, then
   `GET /api/schedules/assignments` — which back-fills `GroupAssignment` from whatever
   group numbers it finds on students (`route.ts:103-121`) — **creates a group 3 in
   1BHIT**. A phantom cohort with one member, invented by a read endpoint.

The manual transfer route never had this problem: it takes `targetGroupId` from the admin
and writes it explicitly.

**Fix.** Sync now clears `groupId` whenever it changes a student's class, on both the
update and the reactivate path. Null means "unassigned", which is a state the rotation
editor already renders and which puts the decision in front of a human instead of guessing.
The preview surfaces it before apply, so an admin sees `1AHIT → 1BHIT / Gruppe 2 wird
aufgehoben` rather than discovering it later. A student whose profile changed but whose
class did not keeps their group; only a genuine move clears it.

## Bug 2 — renaming a class orphaned its rotation groups

`GroupAssignment.class` is the class **name**. Entra is the source of truth for class
names and sync overwrites `Class.name` from the group's `displayName` — so renaming a
group in Entra (`1AHIT` → `2AHIT` at year rollover is the obvious case) left every
`GroupAssignment` row stranded under the old name. The class kept its students and their
group numbers, but the rotation editor read zero groups for it and the schedule rendered
empty. Nothing errored; the groups were just gone.

**Fix.** The class update and reactivate paths now migrate `GroupAssignment` rows onto the
new name inside the same transaction. Rows already sitting under the destination name can
only be orphans of an earlier rename — `Class.name` is unique, so no live class holds it —
and are dropped, because the unique `(class, groupId)` index would otherwise reject the
migration.

The real fix is to key `GroupAssignment` by `classId`. That is a schema migration touching
`schedules/assignments`, the transfer route and the import path, and it did not belong in
the same change as the LDAP cutover. `npm run db:audit-entra-adoption` reports dangling
rows so the damage is at least visible in the meantime.

---

## Known-remaining sharp edges

- **A rename that collides.** If an Entra group is renamed to a name another active class
  already holds, `Class.name`'s unique index rejects the update and the whole sync
  transaction rolls back. Loud, but the error will not obviously say "two classes want the
  same name".
- **Ambiguous membership.** A student in two synced class groups is marked
  `syncStatus = 'unassigned'` and keeps their existing class and group rather than being
  guessed at. That is deliberate — see `StudentSyncUnassigned` — but it means a botched
  Entra move (added to the new group, not removed from the old) leaves them in the old
  class, not the new one. The issues tab is the only place this shows up.
- **Preview/apply race.** `applyClassStudentSync` recomputes the diff before applying, so
  an admin can approve diff A and have diff B applied. Small window, real hazard, still
  open — item 2 in `ENTRA_MIGRATION.md`.

---

## Tests

`src/lib/__tests__/class-student-sync-move.test.ts` covers:

- a live move is reported with the group it costs, and clears it on apply
- `ClassMembership` is repointed to the new class for the school year
- a profile-only change keeps the group
- a deactivated student returning into a *different* class reports and clears the group too
- a deactivated student returning into the *same* class keeps it
- a rename carries `GroupAssignment` across to the new class name

`src/lib/__tests__/microsoft-access.test.ts` additionally pins the Entra profile mapping —
that the object id rather than `sub` becomes the identifier sync keys on, which matters
because `AzureADProvider` parks the caller's overrides on `.options` and merges them later,
so it is easy to believe an override is live when it is not.
