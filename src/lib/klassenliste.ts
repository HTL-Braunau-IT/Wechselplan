import { prisma } from '@/lib/prisma'
import { resolveMemberClassIds } from '@/lib/combined-classes'

/**
 * Class-list ("Klassenliste") data access.
 *
 * A Klassenliste is a printable roster of one class, split into its Wechselplan
 * rotation groups, with a chosen amount of blank writing space per student — a
 * teacher downloads it to tick attendance or jot notes on paper. This module is
 * the single roster source shared by the preview endpoint and the PDF endpoint,
 * so both always agree.
 *
 * `Student.groupId` is the source of truth for group membership (see CLAUDE.md).
 * A class with at least one grouped student "has a plan" and prints grouped; a
 * class with none prints as one flat, ungrouped list. Students left unassigned in
 * an otherwise-grouped class are never dropped — they print in a trailing
 * "Ohne Gruppe" section (id {@link UNGROUPED_SECTION_ID}).
 */

/** The blank writing area printed to the right of each student's name. */
export type WritingSpace = 'columns' | 'split' | 'notes' | 'blank'

export const WRITING_SPACES: readonly WritingSpace[] = ['columns', 'split', 'notes', 'blank']

export function isWritingSpace(value: unknown): value is WritingSpace {
  return typeof value === 'string' && (WRITING_SPACES as readonly string[]).includes(value)
}

/** Synthetic section id for students with no rotation group. */
export const UNGROUPED_SECTION_ID = 0

export interface RosterStudent {
  id: number
  firstName: string
  lastName: string
  groupId: number | null
}

export interface ClassRoster {
  classId: number
  className: string
  classHead: string | null
  classLead: string | null
  schoolYearLabel: string
  students: RosterStudent[]
}

export interface RosterPerson {
  firstName: string
  lastName: string
}

export interface KlassenlisteSection {
  /** Rotation group id (1-based), or {@link UNGROUPED_SECTION_ID} for unassigned. */
  id: number
  students: RosterPerson[]
}

export interface KlassenlisteView {
  hasPlan: boolean
  /** Group sections (plus a trailing ungrouped section) when the class has a plan. */
  sections: KlassenlisteSection[]
  /** All students as one flat list when the class has no plan. */
  plain: RosterPerson[]
  /** Total students across whatever is included. */
  total: number
}

function fullName(teacher: { firstName: string; lastName: string } | null): string | null {
  return teacher ? `${teacher.firstName} ${teacher.lastName}` : null
}

const isRealGroup = (groupId: number | null): groupId is number => groupId != null && groupId >= 1

/**
 * Shortens a school-year label for the dense PDF header: "2026/2027" → "2026/27".
 * Any label that is not the four-slash-four form is returned unchanged.
 */
export function shortSchoolYearLabel(label: string): string {
  const match = /^(\d{4})\/(\d{4})$/.exec(label.trim())
  if (!match) return label
  return `${match[1]}/${match[2]!.slice(2)}`
}

/**
 * Loads a class's roster for one school year, expanding combined classes into
 * their member classes and reading membership from `ClassMembership` (the
 * year-correct source, not `Student.classId`). Returns `null` when the class does
 * not exist.
 */
export async function getClassRoster(
  classId: number,
  schoolYearId: number,
): Promise<ClassRoster | null> {
  const classRecord = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      classHead: { select: { firstName: true, lastName: true } },
      classLead: { select: { firstName: true, lastName: true } },
    },
  })
  if (!classRecord) return null

  const schoolYear = await prisma.schoolYear.findUnique({
    where: { id: schoolYearId },
    select: { label: true },
  })

  const memberIds = await resolveMemberClassIds(classId)
  const memberships = await prisma.classMembership.findMany({
    where: { classId: { in: memberIds }, schoolYearId },
    select: { studentId: true },
  })
  const studentIds = memberships.map(m => m.studentId)

  const students =
    studentIds.length > 0
      ? await prisma.student.findMany({
          where: { id: { in: studentIds }, isActive: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: { id: true, firstName: true, lastName: true, groupId: true },
        })
      : []

  return {
    classId: classRecord.id,
    className: classRecord.name,
    classHead: fullName(classRecord.classHead),
    classLead: fullName(classRecord.classLead),
    schoolYearLabel: schoolYear ? shortSchoolYearLabel(schoolYear.label) : '',
    students,
  }
}

/**
 * Buckets a roster into printable sections.
 *
 * @param groupsFilter when given, only these section ids are kept (used by the
 *   PDF endpoint to honour the teacher's group selection); omit for the full set.
 */
export function buildKlassenlisteView(
  students: RosterStudent[],
  groupsFilter?: readonly number[],
): KlassenlisteView {
  const groupIds = [...new Set(students.filter(s => isRealGroup(s.groupId)).map(s => s.groupId!))].sort(
    (a, b) => a - b,
  )
  const hasPlan = groupIds.length > 0
  const person = (s: RosterStudent): RosterPerson => ({ firstName: s.firstName, lastName: s.lastName })

  if (!hasPlan) {
    return { hasPlan: false, sections: [], plain: students.map(person), total: students.length }
  }

  let sections: KlassenlisteSection[] = groupIds.map(id => ({
    id,
    students: students.filter(s => s.groupId === id).map(person),
  }))
  const ungrouped = students.filter(s => !isRealGroup(s.groupId))
  if (ungrouped.length > 0) {
    sections.push({ id: UNGROUPED_SECTION_ID, students: ungrouped.map(person) })
  }

  if (groupsFilter) {
    const keep = new Set(groupsFilter)
    sections = sections.filter(section => keep.has(section.id))
  }

  const total = sections.reduce((sum, section) => sum + section.students.length, 0)
  return { hasPlan: true, sections, plain: [], total }
}
