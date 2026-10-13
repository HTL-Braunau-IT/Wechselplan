import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { normalizeUsername } from '@/lib/username'
import { requireAccess } from '@/lib/api-guard'
import { isStaffRole } from '@/lib/api-access'
import { resolveSessionStudent } from '@/lib/session-student'
import { resolveSchoolYearId } from '@/lib/school-year'
import { studentGroupByWeekday, studentPlanDays } from '@/lib/weekday-groups'

/** The student's group on each school weekday (groups are per weekday). */
async function groupsByWeekday(
  student: { id: number; groupId: number | null },
  classId: number,
  schoolYearId: number | null,
): Promise<Record<number, number | null>> {
  if (schoolYearId == null) return {}
  const groupOn = await studentGroupByWeekday({
    studentId: student.id,
    classId,
    schoolYearId,
    fallback: student.groupId,
  })
  return Object.fromEntries([1, 2, 3, 4, 5].map(day => [day, groupOn(day)]))
}

/**
 * The weekdays the student has a plan on, each named by the class that owns it.
 * For a member of a combined class that is the combined class, not their own.
 */
async function plans(
  student: { id: number; groupId: number | null },
  classId: number,
  schoolYearId: number | null,
): Promise<{ weekday: number; className: string; groupId: number | null }[]> {
  if (schoolYearId == null) return []
  const days = await studentPlanDays({
    studentId: student.id,
    classId,
    schoolYearId,
    fallback: student.groupId,
  })
  if (days.length === 0) return []
  const classes = await prisma.class.findMany({
    where: { id: { in: [...new Set(days.map(d => d.planClassId))] } },
    select: { id: true, name: true },
  })
  const nameOf = new Map(classes.map(c => [c.id, c.name]))
  return days.flatMap(d => {
    const className = nameOf.get(d.planClassId)
    return className ? [{ weekday: d.weekday, className, groupId: d.groupId }] : []
  })
}

/**
 * GET /api/students/class — a student's class, group and plan days.
 *
 * Staff look a student up by the `username` query parameter. A student caller
 * always gets their own record, resolved from the session; `username` is ignored.
 *
 * @returns A JSON response containing the class name and groupId, or an error message with the corresponding HTTP status code.
 */
export async function GET(request: Request) {
  const gate = await requireAccess('session')
  if (!gate.ok) return gate.response

  const { searchParams } = new URL(request.url)
  const schoolYearIdParam = searchParams.get('schoolYearId')
  const schoolYearId = schoolYearIdParam ? parseInt(schoolYearIdParam, 10) : undefined

  // A student caller only ever gets their own class/group, resolved from the
  // session — never from `username`, or a student could enumerate the class and
  // rotation group of every classmate. Their record is not looked up by
  // `session.user.name` either: for an Entra session that is the normalized
  // display name ("anna müller"), not the Student.username ("anna.mueller"), so
  // comparing the two locked students out of their own plan.
  const isStaff = isStaffRole(gate.session?.user?.role)
  const rawUsername = searchParams.get('username')
  const username = rawUsername ? normalizeUsername(rawUsername) : ''
  if (isStaff && !username) {
    return NextResponse.json({ error: 'Username parameter is required' }, { status: 400 })
  }

  try {
    const caller = isStaff ? null : await resolveSessionStudent(gate.session)
    if (!isStaff && !caller) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    const student = await prisma.student.findUnique({
      where: caller ? { id: caller.id } : { username },
      include: { class: true },
    })

    if (!student) {
      console.warn('[username-match] Student not found', { raw: rawUsername, normalized: username })
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    if (schoolYearId != null && !Number.isNaN(schoolYearId)) {
      const membership = await prisma.classMembership.findUnique({
        where: { studentId_schoolYearId: { studentId: student.id, schoolYearId } },
        include: { class: true },
      })
      if (membership?.class) {
        return NextResponse.json({
          class: membership.class.name,
          groupId: student.groupId,
          groupsByWeekday: await groupsByWeekday(student, membership.class.id, schoolYearId),
          plans: await plans(student, membership.class.id, schoolYearId),
        })
      }
    }

    if (!student.class) {
      return NextResponse.json({ error: 'Student has no class assigned' }, { status: 404 })
    }

    const yearId = await resolveSchoolYearId(schoolYearId)
    return NextResponse.json({
      class: student.class.name,
      groupId: student.groupId,
      groupsByWeekday: await groupsByWeekday(student, student.class.id, yearId),
      plans: await plans(student, student.class.id, yearId),
    })
  } catch (error) {
    captureError(error, {
      location: 'api/students/class',
      type: 'fetch-student-class',
    })
    return NextResponse.json({ error: 'Failed to fetch student class' }, { status: 500 })
  }
}
