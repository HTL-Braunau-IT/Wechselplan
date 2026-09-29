import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { studentPlanDays } from '@/lib/weekday-groups'
import {
  compactGradingCriteriaContent,
  parseGradingCriteriaContent,
  type GradingCriteriaDocument,
  type GradingCriteriaInput,
  type GradingCriteriaListResponse,
  type GradingCriteriaTemplate,
  type StudentGradingCriteria,
} from '@/types/grading-criteria'

/**
 * Beurteilungskriterien: which template a student sees for a teacher, and the
 * teacher-side writes that keep the "one default, one template per class"
 * invariants.
 *
 * Resolution for one teacher and one student, first match wins:
 *   1. the template assigned to the class owning the student's plan (for a
 *      member of a combined class, the combined class),
 *   2. the template assigned to the student's own class,
 *   3. the teacher's default template.
 * No match means the teacher has published nothing for that student.
 */

interface TemplateForPick {
  id: number
  isDefault: boolean
  classes: { classId: number }[]
}

/** Picks the template that applies for the given classes, most specific first. */
export function pickCriteria<T extends TemplateForPick>(
  templates: readonly T[],
  classIdsByPriority: readonly number[],
): T | null {
  for (const classId of classIdsByPriority) {
    const match = templates.find(t => t.classes.some(c => c.classId === classId))
    if (match) return match
  }
  return templates.find(t => t.isDefault) ?? null
}

/** Secret for a template's public view-only link: 144 random bits, URL-safe. */
export function newShareToken(): string {
  return randomBytes(18).toString('base64url')
}

const teacherName = (t: { firstName: string; lastName: string }) =>
  [t.firstName, t.lastName].filter(Boolean).join(' ')

type TemplateRow = Prisma.GradingCriteriaGetPayload<{
  include: { teacher: true }
}>

function toDocument(row: TemplateRow): GradingCriteriaDocument {
  return {
    title: row.title,
    subtitle: row.subtitle,
    content: parseGradingCriteriaContent(row.content),
    teacherName: teacherName(row.teacher),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Classes a teacher may attach a template to: those they teach in any school year. */
async function taughtClassIds(teacherId: number): Promise<Set<number>> {
  const rows = await prisma.teacherAssignment.findMany({
    where: { teacherId },
    select: { classId: true },
    distinct: ['classId'],
  })
  return new Set(rows.map(r => r.classId))
}

export async function listTeacherCriteria(
  teacher: { id: number; firstName: string; lastName: string },
  schoolYearId: number | null,
): Promise<GradingCriteriaListResponse> {
  const [templates, assignments] = await Promise.all([
    prisma.gradingCriteria.findMany({
      where: { teacherId: teacher.id },
      include: { classes: { include: { class: { select: { id: true, name: true } } } } },
      orderBy: [{ isDefault: 'desc' }, { title: 'asc' }],
    }),
    prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id, ...(schoolYearId != null ? { schoolYearId } : {}) },
      select: { class: { select: { id: true, name: true, isActive: true } } },
      distinct: ['classId'],
    }),
  ])

  const classes = assignments
    .map(a => a.class)
    .filter(c => c.isActive)
    .map(c => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))

  return {
    teacherName: teacherName(teacher),
    classes,
    templates: templates.map(
      (t): GradingCriteriaTemplate => ({
        id: t.id,
        title: t.title,
        subtitle: t.subtitle,
        content: parseGradingCriteriaContent(t.content),
        isDefault: t.isDefault,
        shareToken: t.shareToken,
        classes: t.classes.map(c => c.class).sort((a, b) => a.name.localeCompare(b.name, 'de')),
        updatedAt: t.updatedAt.toISOString(),
      }),
    ),
  }
}

export class GradingCriteriaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * Creates (`id` null) or updates one of the teacher's templates.
 *
 * Marking it default clears the flag on the teacher's other templates. Class
 * ids are an exact set for this template: classes dropped from the list lose
 * their override, and a class currently on another of the teacher's templates
 * moves here (one template per teacher and class).
 */
export async function saveTeacherCriteria(
  teacherId: number,
  id: number | null,
  input: GradingCriteriaInput,
): Promise<number> {
  const classIds = [...new Set(input.classIds)]

  if (id != null) {
    const existing = await prisma.gradingCriteria.findUnique({
      where: { id },
      select: { teacherId: true, classes: { select: { classId: true } } },
    })
    if (existing?.teacherId !== teacherId) {
      throw new GradingCriteriaError('Kriterien nicht gefunden', 404)
    }
  }

  if (classIds.length > 0) {
    // Only classes the teacher actually teaches, plus overrides they already hold
    // (a class they no longer teach can be kept or removed, never newly added).
    const [taught, held] = await Promise.all([
      taughtClassIds(teacherId),
      prisma.gradingCriteriaClass.findMany({ where: { teacherId }, select: { classId: true } }),
    ])
    for (const h of held) taught.add(h.classId)
    const foreign = classIds.filter(c => !taught.has(c))
    if (foreign.length > 0) {
      throw new GradingCriteriaError('Klasse wird nicht von dir unterrichtet', 403)
    }
  }

  const data = {
    title: input.title,
    subtitle: input.subtitle?.trim() ? input.subtitle.trim() : null,
    content: compactGradingCriteriaContent(input.content),
    isDefault: input.isDefault,
  }

  return prisma.$transaction(async tx => {
    const saved =
      id == null
        ? await tx.gradingCriteria.create({ data: { ...data, teacherId } })
        : await tx.gradingCriteria.update({ where: { id }, data })

    if (input.isDefault) {
      await tx.gradingCriteria.updateMany({
        where: { teacherId, isDefault: true, id: { not: saved.id } },
        data: { isDefault: false },
      })
    }

    await tx.gradingCriteriaClass.deleteMany({
      where: { teacherId, OR: [{ criteriaId: saved.id }, { classId: { in: classIds } }] },
    })
    if (classIds.length > 0) {
      await tx.gradingCriteriaClass.createMany({
        data: classIds.map(classId => ({ criteriaId: saved.id, teacherId, classId })),
      })
    }

    return saved.id
  })
}

/** The document behind a share link, or null when the link is unknown or revoked. */
export async function sharedCriteria(token: string): Promise<GradingCriteriaDocument | null> {
  if (!token || token.length > 64) return null
  const row = await prisma.gradingCriteria.findUnique({
    where: { shareToken: token },
    include: { teacher: true },
  })
  return row ? toDocument(row) : null
}

/**
 * Every teacher the student meets in this school year's Wechselplan (any
 * weekday, morning or afternoon, any Turnus — the student rotates through all
 * of them) that has criteria for them, each with the template that applies.
 */
export async function studentGradingCriteria(
  student: { id: number; classId: number | null; groupId: number | null },
  schoolYearId: number,
): Promise<StudentGradingCriteria[]> {
  if (student.classId == null) return []

  const days = await studentPlanDays({
    studentId: student.id,
    classId: student.classId,
    schoolYearId,
    fallback: student.groupId,
  })
  if (days.length === 0) return []

  const assignments = await prisma.teacherAssignment.findMany({
    where: {
      schoolYearId,
      OR: days.map(d => ({ classId: d.planClassId, selectedWeekday: d.weekday })),
      teacher: { isActive: true },
    },
    select: {
      classId: true,
      teacher: { select: { id: true, firstName: true, lastName: true } },
      subject: { select: { name: true } },
    },
  })

  const byTeacher = new Map<
    number,
    { firstName: string; lastName: string; planClassIds: number[]; subjects: Set<string> }
  >()
  for (const a of assignments) {
    const entry = byTeacher.get(a.teacher.id) ?? {
      firstName: a.teacher.firstName,
      lastName: a.teacher.lastName,
      planClassIds: [],
      subjects: new Set<string>(),
    }
    if (!entry.planClassIds.includes(a.classId)) entry.planClassIds.push(a.classId)
    if (a.subject.name) entry.subjects.add(a.subject.name)
    byTeacher.set(a.teacher.id, entry)
  }
  if (byTeacher.size === 0) return []

  const templates = await prisma.gradingCriteria.findMany({
    where: { teacherId: { in: [...byTeacher.keys()] } },
    include: { teacher: true, classes: { select: { classId: true } } },
  })

  const result: StudentGradingCriteria[] = []
  for (const [teacherId, info] of byTeacher) {
    const own = templates.filter(t => t.teacherId === teacherId)
    const picked = pickCriteria(own, [...info.planClassIds, student.classId])
    if (!picked) continue
    result.push({
      teacherId,
      teacherFirstName: info.firstName,
      teacherLastName: info.lastName,
      subjects: [...info.subjects].sort((a, b) => a.localeCompare(b, 'de')),
      criteria: toDocument(picked),
    })
  }

  return result.sort(
    (a, b) =>
      a.teacherLastName.localeCompare(b.teacherLastName, 'de') ||
      a.teacherFirstName.localeCompare(b.teacherFirstName, 'de'),
  )
}
