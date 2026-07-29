/**
 * Renders every PDF the app can produce, filled with worst-case sample data, so
 * the layouts can be eyeballed without a database, a login or a real class.
 *
 * The fixtures deliberately sit at the ceiling the school actually hits — four
 * groups of twelve students, four teachers in the morning and four in the
 * afternoon, eight turnus columns — because that is where the layouts either
 * hold or fall apart. Shrinking any of them only makes the sheets emptier.
 *
 * Run with:
 *   npm run pdf:preview            # writes to .pdf-preview/
 *   npm run pdf:preview -- /tmp/x  # writes somewhere else
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  generateNotensammlerAllClassesPDF,
  generateNotensammlerPDF,
  generateSchedulePDF,
} from '../src/lib/pdf-generator'
import { renderPdfToBuffer } from '../src/lib/pdf/render'
import ScheduleTurnusPDF, { type ScheduleData } from '../src/components/ScheduleTurnusPDF'
import type { GradesData } from '../src/lib/grades'

const LAST_NAMES = [
  'Aigner',
  'Baumgartner',
  'Cerny',
  'Doppelhofer',
  'Ebner',
  'Fuchsberger',
  'Gruber',
  'Hinterleitner',
  'Innerhofer',
  'Jandl',
  'Kaltenbrunner',
  'Lindenthaler',
  'Moser',
  'Neubauer',
  'Obermayr',
  'Pichler',
  'Quehenberger',
  'Riedlsperger',
  'Schwarzenberger',
  'Trattnig',
  'Unterberger',
  'Voglhuber',
  'Wallner',
  'Zehetner',
  'Achleitner',
  'Brandstätter',
  'Christandl',
  'Dorfinger',
  'Eisenberger',
  'Fellhofer',
  'Grabenweger',
  'Haselsteiner',
  'Illmayer',
  'Kirchschläger',
  'Leitgeb',
  'Mayrhofer',
  'Nussbaumer',
  'Ortner',
  'Prammer',
  'Reithofer',
  'Steinlechner',
  'Traunmüller',
  'Url',
  'Vasold',
  'Wiesinger',
  'Zauner',
  'Angerer',
  'Bruckmüller',
]
const FIRST_NAMES = [
  'Maximilian',
  'Sophie',
  'Lukas',
  'Anna',
  'Tobias',
  'Lena',
  'Jakob',
  'Marie',
  'Felix',
  'Johanna',
  'Elias',
  'Sarah',
  'David',
  'Laura',
  'Simon',
  'Emma',
]

/** 4 groups × 12 students — the ceiling a Wechselplan has to survive. */
const GROUP_COUNT = 4
const STUDENTS_PER_GROUP = 12
const TURNUS_COUNT = 8
const TEACHERS_PER_PERIOD = 4

function student(index: number) {
  return {
    id: index + 1,
    firstName: FIRST_NAMES[index % FIRST_NAMES.length]!,
    lastName: LAST_NAMES[index % LAST_NAMES.length]!,
    groupId: (index % GROUP_COUNT) + 1,
  }
}

const allStudents = Array.from({ length: GROUP_COUNT * STUDENTS_PER_GROUP }, (_, i) => student(i))

const groups = Array.from({ length: GROUP_COUNT }, (_, g) => ({
  id: g + 1,
  students: allStudents.filter(s => s.groupId === g + 1),
}))

const TEACHER_NAMES = [
  ['Hans', 'Müllner'],
  ['Petra', 'Schachinger'],
  ['Andreas', 'Wimmer'],
  ['Birgit', 'Falkensteiner'],
  ['Josef', 'Radlmayr'],
  ['Claudia', 'Hofstätter'],
  ['Martin', 'Zeilinger'],
  ['Eva', 'Brunnthaler'],
] as const

function teacher(index: number) {
  const [firstName, lastName] = TEACHER_NAMES[index % TEACHER_NAMES.length]!
  return { id: index + 1, firstName, lastName }
}

const amTeachers = Array.from({ length: TEACHERS_PER_PERIOD }, (_, i) => teacher(i))
const pmTeachers = Array.from({ length: TEACHERS_PER_PERIOD }, (_, i) =>
  teacher(i + TEACHERS_PER_PERIOD),
)

const WORKSHOPS = [
  'Metallbearbeitung',
  'Elektrotechnik',
  'CNC-Fertigung',
  'Mechatronik-Labor',
  'Schweißtechnik',
  'Pneumatik/Hydraulik',
  'Kunststofftechnik',
  'Automatisierung',
]
const CONTENTS = [
  'Feilen und Bohren',
  'Schaltungsaufbau',
  'Drehen Grundkurs',
  'Sensorik',
  'MAG-Schweißen',
  'Steuerungstechnik',
  'Spritzguss',
  'SPS-Programmierung',
]

function assignments(teachers: ReturnType<typeof teacher>[], offset: number) {
  return teachers.map((t, i) => ({
    teacherFirstName: t.firstName,
    teacherLastName: t.lastName,
    subjectName: WORKSHOPS[(i + offset) % WORKSHOPS.length]!,
    learningContentName: CONTENTS[(i + offset) % CONTENTS.length]!,
    roomName: `W${offset + i + 1}.${(i % 3) + 1}`,
    groupId: i + 1,
  }))
}

/** Eight turnus of five teaching weeks each, starting mid-September. */
function buildTurns(): ScheduleData {
  const turns: ScheduleData = {}
  const cursor = new Date(2025, 8, 15)

  for (let t = 0; t < TURNUS_COUNT; t++) {
    const weeks = []
    for (let w = 0; w < 5; w++) {
      const date = new Date(cursor)
      const isoWeek = Math.ceil(
        ((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7,
      )
      weeks.push({
        date: `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`,
        week: `KW ${isoWeek}`,
        // Every fourth turnus loses a week to holidays, so the red styling shows up.
        isHoliday: t % 4 === 3 && w === 3,
      })
      cursor.setDate(cursor.getDate() + 7)
    }
    turns[`Turnus ${t + 1}`] = { name: `Turnus ${t + 1}`, weeks }
  }
  return turns
}

const turns = buildTurns()

/** Every teacher marks every student, with a couple of sentinels sprinkled in. */
function buildGrades(): GradesData {
  const grades: GradesData = {}
  const teachers = [...amTeachers, ...pmTeachers]
  allStudents.forEach((s, si) => {
    grades[s.id] = {}
    teachers.forEach((t, ti) => {
      const base = ((si + ti) % 5) + 1
      grades[s.id]![t.id] = {
        first: si === 3 && ti === 0 ? 6 : base,
        second: si === 7 && ti === 1 ? 7 : ((si + ti + 2) % 5) + 1,
      }
    })
  })
  return grades
}

const finalGrades = Object.fromEntries(
  allStudents.map((s, i) => [
    s.id,
    {
      first: (i % 5) + 1,
      second: ((i + 1) % 5) + 1,
      conductWishFirst: ['Sehr zufriedenstellend', 'Zufriedenstellend', 'Wenig zufriedenstellend'][
        i % 3
      ]!,
      conductWishSecond: ['Sehr zufriedenstellend', 'Zufriedenstellend'][i % 2]!,
    },
  ]),
)

async function main() {
  const outDir = resolve(process.cwd(), process.argv[2] ?? '.pdf-preview')
  mkdirSync(outDir, { recursive: true })

  const wechselplan = await generateSchedulePDF({
    groups,
    amAssignments: assignments(amTeachers, 0),
    pmAssignments: assignments(pmTeachers, 4),
    turns: turns as unknown as Record<string, unknown>,
    className: '2AHME',
    classHead: 'Mag. Karin Aichinger',
    classLead: 'DI Robert Steinkellner',
    additionalInfo:
      'Am 24.10. entfällt der Nachmittagsunterricht wegen der Schulveranstaltung. Gruppe 3 startet nach der Sicherheitsunterweisung.',
    selectedWeekday: 1,
    scheduleTimes: [
      { startTime: '07:50', endTime: '08:40', period: 'AM' },
      { startTime: '08:45', endTime: '09:35', period: 'AM' },
      { startTime: '09:55', endTime: '10:45', period: 'AM' },
      { startTime: '10:50', endTime: '12:30', period: 'AM' },
      { startTime: '13:20', endTime: '14:10', period: 'PM' },
      { startTime: '14:15', endTime: '15:05', period: 'PM' },
      { startTime: '15:15', endTime: '17:00', period: 'PM' },
    ],
    breakTimes: [
      { period: 'AM', startTime: '09:35', endTime: '09:55' },
      { period: 'LUNCH', startTime: '12:30', endTime: '13:20' },
      { period: 'PM', startTime: '15:05', endTime: '15:15' },
    ],
    updatedAt: new Date(2025, 8, 12),
  })
  writeFileSync(resolve(outDir, 'wechselplan.pdf'), wechselplan)

  const turnusDates = await renderPdfToBuffer(
    ScheduleTurnusPDF({ scheduleData: turns, className: '2AHME', weekdayString: 'Montag' }),
  )
  writeFileSync(resolve(outDir, 'unterrichtstage.pdf'), turnusDates)

  const notensammler = await generateNotensammlerPDF({
    className: '2AHME',
    subjectName: 'Werkstätte und Produktionstechnik',
    students: allStudents,
    amTeachers,
    pmTeachers,
    grades: buildGrades(),
    finalGrades,
  })
  writeFileSync(resolve(outDir, 'notensammler.pdf'), notensammler)

  const allClasses = await generateNotensammlerAllClassesPDF({
    teacherName: 'Hans Müllner',
    classes: ['1AHME', '2AHME', '3BHME', '4AHME', '1BHME'].map(className => ({
      className,
      subjectName: 'Werkstätte und Produktionstechnik',
      students: allStudents.slice(0, 36),
      grades: Object.fromEntries(
        allStudents
          .slice(0, 36)
          .map((s, i) => [
            s.id,
            { first: i === 2 ? 6 : (i % 5) + 1, second: i === 5 ? 7 : ((i + 2) % 5) + 1 },
          ]),
      ),
    })),
  })
  writeFileSync(resolve(outDir, 'notensammler-alle-klassen.pdf'), allClasses)

  console.log(`PDFs written to ${outDir}`)
}

void main()
