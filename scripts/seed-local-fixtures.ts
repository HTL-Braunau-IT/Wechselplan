/**
 * Populates a LOCAL database with people and rotations to click around in.
 *
 * `prisma/seed.ts` seeds reference data only — holidays, times, rooms,
 * subjects, learning contents — and deliberately creates no people, because in
 * a real deployment teachers, classes and students arrive from Entra. That
 * leaves a freshly migrated local database with nothing to look at: every
 * schedule and grade page renders its empty state.
 *
 * This script fills that gap for local work only. It is never invoked by
 * `npm run db:seed`, is not referenced by `prisma.seed`, and refuses to run
 * against anything that does not look like a local database — see
 * `assertLocalDatabase` below.
 *
 * Run with:
 *   npm run db:seed:local            # create or update the fixtures
 *   npm run db:seed:local -- --reset # delete them first, then recreate
 *
 * Everything it writes is tagged `externalSource = 'local-fixture'`, so the
 * rows are identifiable at a glance in /admin/data and `--reset` can remove
 * exactly what this script created and nothing else.
 */
import { PrismaClient, type Prisma } from '@prisma/client'
import { format, getISOWeek } from 'date-fns'
import { loadEnvFile } from '../e2e/load-env'
import { normalizeUsername } from '../src/lib/username'

const FIXTURE_SOURCE = 'local-fixture'

const prisma = new PrismaClient()

/**
 * Refuses to touch anything but a local database.
 *
 * The guard is structural rather than a comment, because the failure mode is
 * severe and silent: pointed at the school's database this script would invent
 * students alongside the real ones, and `--reset` deletes rows. Three
 * independent conditions must all hold.
 */
async function assertLocalDatabase(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run with NODE_ENV=production.')
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set — is there a .env in the project root?')
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    throw new Error('DATABASE_URL could not be parsed as a URL.')
  }
  if (!localHosts.has(hostname)) {
    throw new Error(
      `Refusing to seed fixtures into a non-local database (host: ${hostname}).\n` +
        'This script is for local development only.',
    )
  }

  // A database holding Entra-synced people is a real deployment's, whatever
  // host it happens to be reachable on (a tunnel, a port-forward, a restored
  // dump). Fixtures have no business there.
  const synced = await prisma.teacher.count({
    where: { externalSource: { not: null, notIn: [FIXTURE_SOURCE] } },
  })
  if (synced > 0) {
    throw new Error(
      `Refusing to seed: this database already holds ${synced} directory-synced teacher(s).\n` +
        'That makes it a real deployment, not a local scratch database.',
    )
  }
}

/** Deletes only rows this script created, in foreign-key-safe order. */
async function reset(): Promise<void> {
  const classes = await prisma.class.findMany({
    where: { externalSource: FIXTURE_SOURCE },
    select: { id: true, name: true },
  })
  const classIds = classes.map(c => c.id)
  const classNames = classes.map(c => c.name)

  await prisma.teacherRotation.deleteMany({ where: { classId: { in: classIds } } })
  await prisma.teacherAssignment.deleteMany({ where: { classId: { in: classIds } } })
  await prisma.scheduleTurn.deleteMany({ where: { schedule: { classId: { in: classIds } } } })
  await prisma.schedule.deleteMany({ where: { classId: { in: classIds } } })
  await prisma.classMembership.deleteMany({ where: { classId: { in: classIds } } })
  await prisma.groupAssignment.deleteMany({ where: { class: { in: classNames } } })
  await prisma.student.deleteMany({ where: { externalSource: FIXTURE_SOURCE } })
  // Classes reference teachers as head/lead, so they must go first.
  await prisma.class.deleteMany({ where: { externalSource: FIXTURE_SOURCE } })
  await prisma.teacher.deleteMany({ where: { externalSource: FIXTURE_SOURCE } })

  console.log('🧹 Removed existing local fixtures')
}

const TEACHERS = [
  { firstName: 'Anna', lastName: 'Huber' },
  { firstName: 'Bernhard', lastName: 'Mayr' },
  { firstName: 'Clara', lastName: 'Steiner' },
  { firstName: 'David', lastName: 'Gruber' },
]

const CLASSES = [
  { name: '1AHIF', description: 'Informatik, 1. Jahrgang' },
  { name: '2BHIF', description: 'Informatik, 2. Jahrgang' },
]

const FIRST_NAMES = [
  'Lukas',
  'Sophie',
  'Maximilian',
  'Lena',
  'Tobias',
  'Marie',
  'Jonas',
  'Emma',
  'Felix',
  'Hannah',
  'Paul',
  'Laura',
]

const LAST_NAMES = [
  'Bauer',
  'Wagner',
  'Pichler',
  'Moser',
  'Leitner',
  'Berger',
  'Fuchs',
  'Eder',
  'Schmid',
  'Winkler',
  'Reiter',
  'Brunner',
]

const GROUPS = [1, 2, 3]
const TURNS = ['TURNUS 1', 'TURNUS 2', 'TURNUS 3']
const PERIOD = 'AM'
const WEEKDAY = 1 // Monday
const WEEKS_PER_TURN = 5

async function seedSchoolYear() {
  return prisma.schoolYear.upsert({
    where: { label: '2025/2026' },
    update: { isCurrent: true },
    create: {
      label: '2025/2026',
      startDate: new Date('2025-09-08'),
      endDate: new Date('2026-07-03'),
      semesterChangeDate: new Date('2026-02-06'),
      isCurrent: true,
    },
  })
}

async function seedTeachers() {
  const created = []
  for (const [index, teacher] of TEACHERS.entries()) {
    const username = normalizeUsername(`${teacher.firstName}.${teacher.lastName}`)
    created.push(
      await prisma.teacher.upsert({
        where: { username },
        update: { isActive: true },
        create: {
          ...teacher,
          username,
          email: `${username}@example.invalid`,
          externalId: `${FIXTURE_SOURCE}:teacher:${index + 1}`,
          externalSource: FIXTURE_SOURCE,
          isActive: true,
        },
      }),
    )
  }
  console.log(`👩‍🏫 ${created.length} teachers`)
  return created
}

async function seedClasses(teachers: { id: number }[]) {
  const created = []
  for (const [index, klass] of CLASSES.entries()) {
    created.push(
      await prisma.class.upsert({
        where: { name: klass.name },
        update: { isActive: true },
        create: {
          ...klass,
          externalId: `${FIXTURE_SOURCE}:class:${index + 1}`,
          externalSource: FIXTURE_SOURCE,
          isActive: true,
          classHeadId: teachers[index % teachers.length]?.id ?? null,
          classLeadId: teachers[(index + 1) % teachers.length]?.id ?? null,
        },
      }),
    )
  }
  console.log(`🏫 ${created.length} classes`)
  return created
}

async function seedStudents(klasses: { id: number; name: string }[], schoolYearId: number) {
  let total = 0

  for (const [classIndex, klass] of klasses.entries()) {
    for (const [studentIndex, firstName] of FIRST_NAMES.entries()) {
      const lastName = LAST_NAMES[(studentIndex + classIndex) % LAST_NAMES.length]!
      // Group membership is round-robin so every group has students, which is
      // what makes the rotation views show something.
      const groupId = GROUPS[studentIndex % GROUPS.length]!
      const username = normalizeUsername(
        `${firstName}.${lastName}.${klass.name}.${studentIndex + 1}`,
      )

      const student = await prisma.student.upsert({
        where: { username },
        update: { classId: klass.id, groupId, isActive: true },
        create: {
          firstName,
          lastName,
          username,
          email: `${username}@example.invalid`,
          classId: klass.id,
          groupId,
          externalId: `${FIXTURE_SOURCE}:student:${klass.name}:${studentIndex + 1}`,
          externalSource: FIXTURE_SOURCE,
          isActive: true,
        },
      })

      // Unique on (studentId, schoolYearId): a student sits in exactly one
      // class per school year, so a re-run moves them rather than duplicating.
      await prisma.classMembership.upsert({
        where: { studentId_schoolYearId: { studentId: student.id, schoolYearId } },
        update: { classId: klass.id },
        create: { studentId: student.id, classId: klass.id, schoolYearId },
      })

      total += 1
    }

    // GroupAssignment is the denormalized cache described in
    // docs/ARCHITECTURE.md — Student.groupId stays the source of truth, but
    // the app expects these rows to exist so that empty groups still appear.
    for (const groupId of GROUPS) {
      await prisma.groupAssignment.upsert({
        where: { class_groupId: { class: klass.name, groupId } },
        update: {},
        create: { class: klass.name, groupId },
      })
    }
  }

  console.log(`🎓 ${total} students across ${GROUPS.length} groups per class`)
}

/**
 * Picks reference rows created by `prisma/seed.ts`, falling back to creating
 * them so this script also works on a database that was only migrated.
 */
async function resolveReferenceData() {
  const subject =
    (await prisma.subject.findFirst({ orderBy: { id: 'asc' } })) ??
    (await prisma.subject.create({ data: { name: 'Werkstätte', isCustom: true } }))
  const room =
    (await prisma.room.findFirst({ orderBy: { id: 'asc' } })) ??
    (await prisma.room.create({ data: { name: 'WS1', isCustom: true } }))
  const learningContent =
    (await prisma.learningContent.findFirst({ orderBy: { id: 'asc' } })) ??
    (await prisma.learningContent.create({ data: { name: 'Grundlagen', isCustom: true } }))

  return { subject, room, learningContent }
}

async function seedAssignmentsAndRotations(
  klasses: { id: number; name: string }[],
  teachers: { id: number }[],
  schoolYearId: number,
) {
  const { subject, room, learningContent } = await resolveReferenceData()
  let assignments = 0
  let rotations = 0

  for (const klass of klasses) {
    for (const groupId of GROUPS) {
      await prisma.teacherAssignment.upsert({
        where: {
          classId_period_groupId_schoolYearId: {
            classId: klass.id,
            period: PERIOD,
            groupId,
            schoolYearId,
          },
        },
        update: {},
        create: {
          classId: klass.id,
          period: PERIOD,
          groupId,
          teacherId: teachers[(groupId - 1) % teachers.length]!.id,
          subjectId: subject.id,
          learningContentId: learningContent.id,
          roomId: room.id,
          selectedWeekday: WEEKDAY,
          schoolYearId,
        },
      })
      assignments += 1

      // The rotation: each group meets a different teacher each turn, which is
      // the whole point of a Wechselplan. Offsetting by the turn index is what
      // produces that.
      for (const [turnIndex, turnId] of TURNS.entries()) {
        await prisma.teacherRotation.upsert({
          where: {
            classId_groupId_turnId_period: {
              classId: klass.id,
              groupId,
              turnId,
              period: PERIOD,
            },
          },
          update: {},
          create: {
            classId: klass.id,
            groupId,
            turnId,
            period: PERIOD,
            teacherId: teachers[(groupId - 1 + turnIndex) % teachers.length]!.id,
          },
        })
        rotations += 1
      }
    }
  }

  console.log(`📋 ${assignments} teacher assignments, ${rotations} rotation entries`)
}

async function seedSchedules(klasses: { id: number; name: string }[], schoolYearId: number) {
  // Weeks are stored as pre-formatted strings (see the ScheduleWeek model), so
  // they are generated here rather than derived at read time.
  const firstMonday = new Date('2025-09-15T00:00:00Z')

  for (const klass of klasses) {
    const existing = await prisma.schedule.findFirst({
      where: { classId: klass.id, schoolYearId },
    })
    if (existing) {
      await prisma.scheduleTurn.deleteMany({ where: { scheduleId: existing.id } })
      await prisma.schedule.delete({ where: { id: existing.id } })
    }

    const schedule = await prisma.schedule.create({
      data: {
        name: `Wechselplan ${klass.name}`,
        description: 'Lokale Testdaten',
        startDate: firstMonday,
        endDate: new Date('2026-02-02T00:00:00Z'),
        selectedWeekday: WEEKDAY,
        classId: klass.id,
        schoolYearId,
      },
    })

    let weekOffset = 0
    for (const [turnIndex, name] of TURNS.entries()) {
      const weeks: Prisma.ScheduleWeekCreateWithoutTurnInput[] = []
      for (let i = 0; i < WEEKS_PER_TURN; i += 1) {
        const date = new Date(firstMonday)
        date.setUTCDate(date.getUTCDate() + weekOffset * 7)
        weeks.push({
          date: format(date, 'dd.MM.yy'),
          week: `KW${String(getISOWeek(date)).padStart(2, '0')}`,
        })
        weekOffset += 1
      }

      await prisma.scheduleTurn.create({
        data: { scheduleId: schedule.id, name, order: turnIndex, weeks: { create: weeks } },
      })
    }
  }

  console.log(`🗓️  ${klasses.length} schedules with ${TURNS.length} turns each`)
}

async function main() {
  loadEnvFile()
  await assertLocalDatabase()

  if (process.argv.includes('--reset')) {
    await reset()
  }

  console.log('🌱 Seeding local fixtures...')

  const schoolYear = await seedSchoolYear()
  const teachers = await seedTeachers()
  const klasses = await seedClasses(teachers)
  await seedStudents(klasses, schoolYear.id)
  await seedAssignmentsAndRotations(klasses, teachers, schoolYear.id)
  await seedSchedules(klasses, schoolYear.id)

  const first = teachers[0]
  console.log('\n✅ Done. Sign in as any of:')
  for (const teacher of teachers) {
    console.log(`   ${normalizeUsername(`${teacher.firstName}.${teacher.lastName}`)}`)
  }
  if (first) {
    console.log(
      `\n   E2E_USERNAME=${normalizeUsername(`${first.firstName}.${first.lastName}`)} npm run e2e`,
    )
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
