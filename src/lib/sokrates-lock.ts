import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/server/send-support-email-graph'
import { captureError } from '@/lib/sentry'
import { getGradeDisplayText, type Semester } from '@/lib/grades'
import { bestEffort, notensammlerLink, notify, sokratesChangeDedupeKey } from '@/lib/notifications'

// Re-exported: the Sokrates routes have always imported the current teacher
// from here, and the helper is now shared with the notification layer.
export { resolveCurrentTeacher, type CurrentTeacher } from '@/lib/current-teacher'

/**
 * Sokrates transfer marker + edit lock.
 *
 * Wechselplan cannot push grades into Sokrates (the government Zeugnis system
 * has no API — see the Sokrates research: grades are typed in by hand). So the
 * Klassenleiter marks, per class and semester, that the grades have been
 * entered into Sokrates. Marking closes the class: every teacher's column and
 * the Zeugnisnoten are hard-locked at once, because once the numbers are in
 * Sokrates a change in Wechselplan silently puts the two out of step.
 *
 * The class lead can lift that blanket lock ("Sperre aufheben"), which drops
 * the semester back to a soft mark: edits go through, but each one is recorded
 * and reported to the lead, and individual columns can still be re-locked.
 *
 * This module owns reading that state and recording + notifying on drift. The
 * grade-save routes call {@link isEditBlocked} (per teacher column) or
 * {@link isFinalGradeEditBlocked} (class-wide Zeugnisnote) before writing and
 * {@link recordSokratesChanges} after.
 */

/** Mark + lock state for a single semester of a class. */
export interface SemesterLockStatus {
  /** The class lead has marked this class+semester as entered into Sokrates. */
  marked: boolean
  markedAt: string | null
  markedByName: string | null
  /** Hard lock covering every column (hybrid escalation). */
  lockedAll: boolean
  /** Hard-locked individual teacher/subject columns. */
  lockedTeacherIds: number[]
  transferId: number | null
}

/** Mark + lock state for both semesters of a class. */
export interface SokratesStatus {
  first: SemesterLockStatus
  second: SemesterLockStatus
}

/**
 * Who may mark, unmark, lock or override the Sokrates state of a class.
 *
 * By default that is *only* the class's Klassenleiter (class lead). An admin has
 * no standing Sokrates power over a class they do not lead — being admin used to
 * silently override every class's lock, which made "the lock" meaningless for
 * anyone who also held the admin role. An admin may still act, but only by
 * opting into a deliberate, per-request override (`adminOverride`), surfaced in
 * the UI as an admin-only button. A non-admin passing the flag gets nothing.
 */
export async function canManageSokrates(params: {
  classId: number
  role: unknown
  teacherId: number | null
  /** Honoured only for `role === 'admin'`: a one-off, explicitly-requested override. */
  adminOverride?: boolean
}): Promise<boolean> {
  // The class lead always manages their own class, no override needed.
  if (params.teacherId != null) {
    const classRecord = await prisma.class.findUnique({
      where: { id: params.classId },
      select: { classLeadId: true },
    })
    if (classRecord?.classLeadId != null && classRecord.classLeadId === params.teacherId) {
      return true
    }
  }
  // An admin may override any class, but only when they ask for it explicitly.
  return params.role === 'admin' && params.adminOverride === true
}

/**
 * A Prisma client scoped to an interactive transaction — what
 * {@link withSokratesLock} hands its callback. The full `prisma` client is
 * assignable to it, so helpers default to `prisma` and callers pass `tx` when
 * they want a read to sit inside the locked transaction.
 */
export type SokratesTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Serialise Sokrates marking against every grade write for a class + year.
 *
 * The mark route and all four grade-write routes funnel their read-then-write
 * through this one critical section, so a grade can never commit into the gap
 * between a request reading a still-unmarked lock state and a concurrent
 * `mark` committing its hard lock: the second transaction to
 * ask for the lock blocks until the first commits, then re-reads and sees it.
 *
 * There is no row to `SELECT ... FOR UPDATE` while a semester is unmarked — the
 * `SokratesTransfer` is created by the mark itself — so the coordination point
 * is a Postgres transaction-scoped advisory lock keyed by class + school year
 * rather than a row. It exists whether or not the class has been marked and
 * releases automatically when the transaction commits or rolls back. Keying on
 * class + year (not per semester) keeps every request one lock deep, so the
 * protocol cannot deadlock, at the cost of briefly serialising the two
 * semesters of one class — which marking, a rare act, never makes felt.
 *
 * Re-read the lock state inside `fn` with {@link getSokratesStatus}, passing the
 * `tx` it receives, so the re-check reflects any mark that just committed. Keep
 * best-effort work (change notices, notifications) *outside* `fn`: they must not
 * hold the lock and must never fail the save.
 */
export async function withSokratesLock<T>(
  classId: number,
  schoolYearId: number,
  fn: (tx: SokratesTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async tx => {
    // hashtext() folds the namespaced key into the single int8 advisory slot, so
    // the string prefix keeps it from colliding with any other advisory lock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sokrates:${classId}:${schoolYearId}`}))`
    return fn(tx)
  })
}

const emptySemesterStatus = (): SemesterLockStatus => ({
  marked: false,
  markedAt: null,
  markedByName: null,
  lockedAll: false,
  lockedTeacherIds: [],
  transferId: null,
})

/** A grade that was just written, with the value it replaced. */
export interface GradeChange {
  studentId: number
  teacherId: number
  semester: Semester
  oldGrade: number | null
  newGrade: number | null
}

/**
 * Reads the mark/lock state for a class and school year, one entry per semester.
 */
export async function getSokratesStatus(
  classId: number,
  schoolYearId: number,
  client: SokratesTx = prisma,
): Promise<SokratesStatus> {
  const transfers = await client.sokratesTransfer.findMany({
    where: { classId, schoolYearId },
    include: { subjectLocks: true },
  })

  const status: SokratesStatus = { first: emptySemesterStatus(), second: emptySemesterStatus() }
  for (const transfer of transfers) {
    if (transfer.semester !== 'first' && transfer.semester !== 'second') continue
    status[transfer.semester] = {
      marked: true,
      markedAt: transfer.markedAt.toISOString(),
      markedByName: transfer.markedByName,
      lockedAll: transfer.lockedAll,
      lockedTeacherIds: transfer.subjectLocks.map(lock => lock.teacherId),
      transferId: transfer.id,
    }
  }
  return status
}

/**
 * Whether a teacher's grade in this semester is hard-locked. A locked grade may
 * still be changed by the class lead or an admin (they pass `canOverride`);
 * everyone else is blocked.
 */
export function isEditBlocked(
  status: SokratesStatus,
  semester: Semester,
  teacherId: number,
  canOverride: boolean,
): boolean {
  if (canOverride) return false
  const semesterStatus = status[semester]
  if (!semesterStatus.marked) return false
  return semesterStatus.lockedAll || semesterStatus.lockedTeacherIds.includes(teacherId)
}

/**
 * Whether the class-wide Zeugnisnote for this semester is hard-locked. There is
 * no teacher column to scope it to, so only the blanket lock applies — a single
 * locked subject column says nothing about the final grade. As with
 * {@link isEditBlocked}, the class lead and admins pass `canOverride` and are
 * never blocked.
 */
export function isFinalGradeEditBlocked(
  status: SokratesStatus,
  semester: Semester,
  canOverride: boolean,
): boolean {
  if (canOverride) return false
  const semesterStatus = status[semester]
  return semesterStatus.marked && semesterStatus.lockedAll
}

const formatGrade = (grade: number | null): string =>
  grade === null ? '—' : getGradeDisplayText(grade)

/** One class+semester whose open change notices should be acknowledged. */
export interface SokratesChangeScope {
  classId: number
  schoolYearId: number
  semester: Semester
}

/**
 * Marks a class lead's open {@link SokratesChangeNotice} rows as acknowledged and
 * closes the loop for whoever made the changes: each subject teacher whose edit
 * the lead just acknowledged gets a `sokrates-change-acknowledged` bell entry —
 * the proof the issue asks for that the lead has actually seen the drift.
 *
 * Scoped to the caller: only notices addressed to `recipientId` (the class lead)
 * are touched, so an admin override or a stray id clears nothing that is not
 * theirs. Called from both the bell (dismissing a `sokrates-change` row) and the
 * notensammler rundown panel (an explicit "Gesehen" button), so the two stay in
 * lock-step. The notify half is best-effort — the acknowledgement has committed.
 *
 * @returns the number of notices acknowledged.
 */
export async function acknowledgeSokratesChangeNotices(params: {
  scopes: readonly SokratesChangeScope[]
  recipientId: number
  acknowledgedByName: string
  now: Date
}): Promise<number> {
  const { scopes, recipientId, acknowledgedByName, now } = params
  if (scopes.length === 0) return 0

  // One notify entry per (teacher who changed, class, semester). Snapshots the
  // class name and school year off the notices so the message renders without a
  // second lookup, and counts the acknowledged changes for the singular/plural.
  const acknowledgedGroups = new Map<
    string,
    { changedById: number; className: string; schoolYearId: number; semester: Semester; count: number }
  >()
  let total = 0

  for (const scope of scopes) {
    const open = await prisma.sokratesChangeNotice.findMany({
      where: {
        classId: scope.classId,
        schoolYearId: scope.schoolYearId,
        semester: scope.semester,
        recipientId,
        acknowledgedAt: null,
      },
      select: { id: true, changedById: true, className: true },
    })
    if (open.length === 0) continue

    await prisma.sokratesChangeNotice.updateMany({
      where: { id: { in: open.map(n => n.id) } },
      data: { acknowledgedAt: now },
    })
    total += open.length

    for (const notice of open) {
      if (notice.changedById == null) continue
      const key = `${notice.changedById}:${scope.classId}:${scope.semester}`
      const group = acknowledgedGroups.get(key)
      if (group) {
        group.count += 1
      } else {
        acknowledgedGroups.set(key, {
          changedById: notice.changedById,
          className: notice.className,
          schoolYearId: scope.schoolYearId,
          semester: scope.semester,
          count: 1,
        })
      }
    }
  }

  // One best-effort boundary *per teacher*, not one around the loop: a single
  // failed delivery must not suppress the acknowledgements owed to everyone else.
  for (const group of acknowledgedGroups.values()) {
    await bestEffort('sokrates-change-acknowledged', () =>
      notify({
        type: 'sokrates-change-acknowledged',
        // The class lead is the actor; `notify` drops them from the recipients
        // automatically, so a lead acknowledging their own edit tells no one.
        recipientIds: [group.changedById],
        actorId: recipientId,
        actorName: acknowledgedByName,
        params: { className: group.className, semester: group.semester, count: group.count },
        link: notensammlerLink(group.className),
        // School year in the key: reusing class+semester across years would let a
        // later year's acknowledgement overwrite an earlier unread one.
        dedupeKey: `sokrates-change-acknowledged:${group.changedById}:${group.schoolYearId}:${group.className}:${group.semester}`,
      }).then(() => undefined),
    )
  }

  return total
}

/**
 * Records each grade change that lands on an already-marked class+semester as a
 * {@link SokratesChangeNotice} and emails the class lead a summary. Best-effort:
 * a failing email never fails the grade save. Changes made by the class lead
 * themselves are ignored (they don't need to notify themselves).
 *
 * @returns the number of notices created.
 */
export async function recordSokratesChanges(params: {
  classId: number
  schoolYearId: number
  changedById: number | null
  changedByName: string
  status: SokratesStatus
  changes: GradeChange[]
}): Promise<number> {
  const { classId, schoolYearId, changedById, changedByName, status, changes } = params

  // Only changes to a marked semester where the value actually moved matter.
  const relevant = changes.filter(
    change => change.oldGrade !== change.newGrade && status[change.semester].marked,
  )
  if (relevant.length === 0) return 0

  const classRecord = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      classLead: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })
  if (!classRecord) return 0

  const recipientId = classRecord.classLead?.id ?? null

  // Who hears about the change on the bell: the class lead (so they know to
  // re-sync Sokrates) *and* the person who made it — including when that person
  // is the class lead editing their own class. The class lead specifically asked
  // to be reminded of their own post-mark edits, so unlike the rest of the app
  // the actor is not excluded here (`includeActor` below).
  const bellRecipients = [
    ...new Set([recipientId, changedById].filter((id): id is number => id != null)),
  ]

  const studentIds = [...new Set(relevant.map(c => c.studentId))]
  const teacherIds = [...new Set(relevant.map(c => c.teacherId))]
  const [students, teachers] = await Promise.all([
    prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.teacher.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
  ])
  const studentName = new Map(students.map(s => [s.id, `${s.lastName} ${s.firstName}`]))
  const teacherName = new Map(teachers.map(t => [t.id, `${t.firstName} ${t.lastName}`]))

  await prisma.sokratesChangeNotice.createMany({
    data: relevant.map(change => ({
      transferId: status[change.semester].transferId!,
      classId,
      className: classRecord.name,
      semester: change.semester,
      schoolYearId,
      studentId: change.studentId,
      studentName: studentName.get(change.studentId) ?? `#${change.studentId}`,
      teacherId: change.teacherId,
      subjectTeacherName: teacherName.get(change.teacherId) ?? `#${change.teacherId}`,
      oldGrade: change.oldGrade,
      newGrade: change.newGrade,
      changedById,
      changedByName,
      recipientId,
    })),
  })

  // Raise the bell for the class lead and the changer, one entry per affected
  // semester. The count is read back from the still-open notices for the whole
  // class+semester (not scoped to one recipient) so both people see the same
  // running total, and a second change collapsing onto an existing unread entry
  // reports that total rather than overwriting it with the latest batch size.
  //
  // The count query sits inside the bestEffort block on purpose: the grades are
  // already written by the time we get here, so a failure must not surface as a
  // failed save.
  if (bellRecipients.length > 0) {
    await bestEffort('sokrates-change', async () => {
      for (const semester of [...new Set(relevant.map(change => change.semester))]) {
        const open = await prisma.sokratesChangeNotice.count({
          where: { classId, schoolYearId, semester, acknowledgedAt: null },
        })
        await notify({
          type: 'sokrates-change',
          recipientIds: bellRecipients,
          actorId: changedById,
          actorName: changedByName,
          // The changer is one of the recipients on purpose — see bellRecipients.
          includeActor: true,
          params: { className: classRecord.name, semester, count: open, classId, schoolYearId },
          link: notensammlerLink(classRecord.name),
          dedupeKey: sokratesChangeDedupeKey({ classId, schoolYearId, semester }),
        })
      }
    })
  }

  // Email the class lead (best-effort). No lead or no address → in-app only.
  // A lead editing their own class already gets the in-app reminder; don't also
  // email them about their own change.
  const email = recipientId === changedById ? undefined : classRecord.classLead?.email
  if (email) {
    const semesterLabel = (semester: Semester) =>
      semester === 'first' ? '1. Semester' : '2. Semester'
    const lines = relevant.map(change => {
      const student = studentName.get(change.studentId) ?? `#${change.studentId}`
      const teacher = teacherName.get(change.teacherId) ?? `#${change.teacherId}`
      return `• ${student} — ${teacher} (${semesterLabel(change.semester)}): ${formatGrade(
        change.oldGrade,
      )} → ${formatGrade(change.newGrade)}`
    })
    const subject = `Notenänderung nach Sokrates-Übertragung — ${classRecord.name}`
    const body = [
      `In der Klasse ${classRecord.name} wurde(n) ${relevant.length} Note(n) geändert, nachdem sie als in Sokrates eingetragen markiert wurde(n).`,
      '',
      `Geändert von: ${changedByName}`,
      '',
      ...lines,
      '',
      'Bitte prüfen, ob die Note in Sokrates nachgezogen werden muss.',
      'Öffne den Notensammler, um die Änderungen zu bestätigen.',
    ].join('\n')

    try {
      await sendEmail(email, subject, body)
    } catch (error) {
      // Recorded in-app already; the email is the redundant channel.
      captureError(error, {
        location: 'lib/sokrates-lock',
        type: 'notify-class-lead-email',
        extra: { classId, recipientId },
      })
    }
  }

  return relevant.length
}
