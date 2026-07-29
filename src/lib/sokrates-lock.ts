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
 * Only a class's Klassenleiter (class lead) or an admin may mark, unmark or
 * lock its grades. Everyone else can read the state but not change it.
 */
export async function canManageSokrates(params: {
  classId: number
  role: unknown
  teacherId: number | null
}): Promise<boolean> {
  if (params.role === 'admin') return true
  if (params.teacherId == null) return false
  const classRecord = await prisma.class.findUnique({
    where: { id: params.classId },
    select: { classLeadId: true },
  })
  return classRecord?.classLeadId != null && classRecord.classLeadId === params.teacherId
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
): Promise<SokratesStatus> {
  const transfers = await prisma.sokratesTransfer.findMany({
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
  // The class lead editing their own class doesn't need to be told.
  if (recipientId != null && recipientId === changedById) return 0

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

  // Raise the bell for the class lead, one entry per affected semester. The
  // count is read back from the still-open notices rather than from this batch,
  // so a second change collapsing onto the same unread entry reports the total
  // rather than overwriting it with the latest batch size.
  //
  // The count query sits inside the bestEffort block on purpose: the grades are
  // already written by the time we get here, so a failure must not surface as a
  // failed save.
  if (recipientId != null) {
    await bestEffort('sokrates-change', async () => {
      for (const semester of [...new Set(relevant.map(change => change.semester))]) {
        const open = await prisma.sokratesChangeNotice.count({
          where: { classId, schoolYearId, semester, recipientId, acknowledgedAt: null },
        })
        await notify({
          type: 'sokrates-change',
          recipientIds: [recipientId],
          actorId: changedById,
          actorName: changedByName,
          params: { className: classRecord.name, semester, count: open, classId, schoolYearId },
          link: notensammlerLink(classRecord.name),
          dedupeKey: sokratesChangeDedupeKey({ classId, schoolYearId, semester }),
        })
      }
    })
  }

  // Email the class lead (best-effort). No lead or no address → in-app only.
  const email = classRecord.classLead?.email
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
