import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { colors, fonts, groupColor, page } from '@/lib/pdf/theme'
import { Meta, PageFooter, PageHeader } from './primitives'
import { formatDateGerman } from '@/lib/pdf-helpers'
import { truncateSubject } from '@/lib/subject-utils'
import { computeAverage, GESTUNDEN, NICHT_BEURTEILT, type GradesData } from '@/lib/grades'

export interface NotensammlerData {
  className: string
  subjectName?: string
  students: Array<{ id: number; firstName: string; lastName: string; groupId: number | null }>
  amTeachers: Teacher[]
  pmTeachers: Teacher[]
  grades: GradesData
  finalGrades?: Record<
    number,
    {
      first: number | null
      second: number | null
      conductWishFirst?: string | null
      conductWishSecond?: string | null
    }
  >
}

interface Teacher {
  id: number
  firstName: string
  lastName: string
}

/**
 * Worst realistic case: 48 students (4 groups of 12) against 8 teachers — 4 in
 * the morning, 4 in the afternoon — recorded twice, once per semester. That is
 * 25 columns wide, so teacher columns are labelled with short codes and
 * resolved by the legend under the table; anything else either overflows or
 * shrinks the names to an unreadable size.
 */
const MARGIN_X = 24
const CONTENT_WIDTH = page.a4Landscape.width - MARGIN_X * 2

const COL_NR = 18
const COL_GROUP = 24
const COL_NAME = 122
const COL_AVG = 26
const COL_FINAL = 28
const COL_CONDUCT = 26
const SEMESTER_GAP = 8

const IDENTITY_WIDTH = COL_NR + COL_GROUP + COL_NAME
const SEMESTER_WIDTH = (CONTENT_WIDTH - IDENTITY_WIDTH - SEMESTER_GAP) / 2
const SEMESTER_FIXED = COL_AVG + COL_FINAL + COL_CONDUCT

const semesterTheme = {
  first: { tint: colors.brandTint, ink: colors.brandInk, rule: '#BFDBFE' },
  second: { tint: '#F5F3FF', ink: '#5B21B6', rule: '#DDD6FE' },
} as const

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 34,
    paddingHorizontal: MARGIN_X,
    backgroundColor: colors.surface,
    ...fonts.regular,
    color: colors.ink,
  },

  table: {
    marginTop: 12,
    borderWidth: 0.75,
    borderColor: colors.lineStrong,
    borderRadius: 3,
    overflow: 'hidden',
  },

  semesterRow: { flexDirection: 'row' },
  semesterSpacer: { width: IDENTITY_WIDTH, backgroundColor: colors.surfaceSunken },
  semesterTitle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3.5,
  },
  semesterTitleText: {
    ...fonts.bold,
    fontSize: 7,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  gutter: { width: SEMESTER_GAP, backgroundColor: colors.surface },

  headRow: { flexDirection: 'row', alignItems: 'stretch' },
  headCell: {
    justifyContent: 'center',
    paddingVertical: 3.5,
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    borderRightColor: colors.line,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.lineStrong,
  },
  headText: {
    ...fonts.bold,
    fontSize: 6,
    letterSpacing: 0.4,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  headTextCenter: {
    ...fonts.bold,
    fontSize: 6,
    letterSpacing: 0.3,
    color: colors.inkSoft,
    textAlign: 'center',
  },

  row: { flexDirection: 'row', alignItems: 'stretch', minHeight: 12.5 },
  rowAlt: { backgroundColor: colors.surfaceAlt },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 1.5,
    borderRightWidth: 0.5,
    borderRightColor: colors.line,
  },
  nrText: { ...fonts.regular, fontSize: 6.2, color: colors.faint, textAlign: 'center' },
  nameText: { ...fonts.regular, fontSize: 7.2, color: colors.ink },
  groupCell: { alignItems: 'center', justifyContent: 'center' },
  groupChip: {
    width: 12,
    height: 10,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupChipText: { ...fonts.bold, fontSize: 6 },

  gradeText: { ...fonts.regular, fontSize: 7.5, color: colors.ink, textAlign: 'center' },
  gradeSentinel: { ...fonts.regular, fontSize: 6, color: colors.muted, textAlign: 'center' },
  avgText: { ...fonts.bold, fontSize: 7.5, color: colors.ink, textAlign: 'center' },
  finalText: { ...fonts.bold, fontSize: 7.5, textAlign: 'center' },
  conductText: {
    ...fonts.bold,
    fontSize: 6.8,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  faded: { color: colors.faint },

  legend: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  legendLabel: {
    ...fonts.bold,
    fontSize: 6,
    letterSpacing: 0.7,
    color: colors.faint,
    textTransform: 'uppercase',
    marginRight: 8,
    marginBottom: 3,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 3 },
  legendCode: { ...fonts.bold, fontSize: 6.2, color: colors.brandInk },
  legendName: { ...fonts.regular, fontSize: 6.2, color: colors.inkSoft, marginLeft: 3 },
  legendNote: { ...fonts.italic, fontSize: 6, color: colors.muted, marginTop: 2 },

  empty: { ...fonts.italic, fontSize: 8, color: colors.faint, marginTop: 16 },
})

/**
 * "Müller Hans" → "MÜL.H", the code printed above a teacher's grade column.
 * No space: the column is ~25pt wide and any break would push the header onto
 * a second line while its neighbours stay on one.
 */
export function teacherCode(teacher: Teacher): string {
  const last = teacher.lastName.slice(0, 3).toUpperCase()
  const first = teacher.firstName.slice(0, 1).toUpperCase()
  return first ? `${last}.${first}` : last
}

/**
 * "Sehr zufriedenstellend" → "SZ". Spelled out, the Betragensnote wraps over
 * three lines and triples the height of every row on the sheet; the legend
 * under the table resolves the codes.
 */
export function conductCode(wish: string | null | undefined): string {
  if (!wish) return '–'
  const normalized = wish.trim().toLowerCase()
  if (normalized.startsWith('sehr')) return 'SZ'
  if (normalized.startsWith('wenig')) return 'WZ'
  if (normalized.startsWith('nicht')) return 'NZ'
  if (normalized.startsWith('zufrieden')) return 'Z'
  // Anything the app did not produce is shown as-is rather than silently dropped.
  return wish
}

/** Sentinels get short forms; a full "nicht beurteilt" never fits a grade column. */
function gradeText(grade: number | null | undefined): { text: string; sentinel: boolean } {
  if (grade == null) return { text: '', sentinel: false }
  if (grade === NICHT_BEURTEILT) return { text: 'n.b.', sentinel: true }
  if (grade === GESTUNDEN) return { text: 'gest.', sentinel: true }
  return { text: String(grade).replace('.', ','), sentinel: false }
}

function averageText(value: number | string | null): { text: string; sentinel: boolean } {
  if (value === null) return { text: '–', sentinel: true }
  if (value === 'nicht beurteilt') return { text: 'n.b.', sentinel: true }
  if (value === 'gestunden') return { text: 'gest.', sentinel: true }
  return { text: (value as number).toFixed(1).replace('.', ','), sentinel: false }
}

function SemesterHead({
  teachers,
  teacherWidth,
  theme,
}: {
  teachers: Teacher[]
  teacherWidth: number
  theme: (typeof semesterTheme)[keyof typeof semesterTheme]
}) {
  return (
    <>
      {teachers.map(teacher => (
        <View key={teacher.id} style={[styles.headCell, { width: teacherWidth }]}>
          <Text style={styles.headTextCenter}>{teacherCode(teacher)}</Text>
        </View>
      ))}
      <View style={[styles.headCell, { width: COL_AVG, backgroundColor: colors.surfaceSunken }]}>
        <Text style={styles.headTextCenter}>Ø</Text>
      </View>
      <View style={[styles.headCell, { width: COL_FINAL, backgroundColor: theme.tint }]}>
        <Text style={[styles.headTextCenter, { color: theme.ink }]}>Endn.</Text>
      </View>
      <View style={[styles.headCell, { width: COL_CONDUCT }]}>
        <Text style={styles.headTextCenter}>Betr.</Text>
      </View>
    </>
  )
}

/**
 * Per-class grade sheet: every teacher's mark per student, the resulting
 * average, the final grade and the requested Betragensnote — for both semesters
 * side by side.
 */
export default function NotensammlerDocument({ data }: { data: NotensammlerData }) {
  const teachers = [...data.amTeachers, ...data.pmTeachers]
  const teacherWidth = teachers.length
    ? (SEMESTER_WIDTH - SEMESTER_FIXED) / teachers.length
    : SEMESTER_WIDTH - SEMESTER_FIXED

  const students = [...data.students]
    .filter(student => student.groupId != null)
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))

  const title = data.subjectName
    ? `${data.className} · ${truncateSubject(data.subjectName)}`
    : data.className

  const finalGradeText = (studentId: number, semester: 'first' | 'second') => {
    const saved = data.finalGrades?.[studentId]?.[semester]
    if (saved != null) return gradeText(saved)
    // Sentinels propagate: an unassessed student has no numeric final grade to
    // pre-fill, but the sheet should still say so rather than look blank.
    const avg = computeAverage(data.grades[studentId], semester)
    if (avg === 'nicht beurteilt') return { text: 'n.b.', sentinel: true }
    if (avg === 'gestunden') return { text: 'gest.', sentinel: true }
    return { text: '–', sentinel: true }
  }

  const conductText = (studentId: number, semester: 'first' | 'second') => {
    const entry = data.finalGrades?.[studentId]
    if (!entry) return '–'
    return conductCode(semester === 'first' ? entry.conductWishFirst : entry.conductWishSecond)
  }

  const semesters = [
    { key: 'first' as const, label: '1. Semester', theme: semesterTheme.first },
    { key: 'second' as const, label: '2. Semester', theme: semesterTheme.second },
  ]

  return (
    <Document title={`Notensammler ${title}`} author="Wechselplan" subject="Notensammler">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <PageHeader
          title="Notensammler"
          subtitle={title}
          meta={
            <>
              <Meta label="Schüler" value={String(students.length)} />
              <Meta label="Lehrpersonen" value={String(teachers.length)} />
              <Meta label="Stand" value={formatDateGerman(new Date())} />
            </>
          }
        />

        {students.length === 0 || teachers.length === 0 ? (
          <Text style={styles.empty}>
            Keine Schüler mit Gruppenzuteilung oder keine Lehrpersonen für diese Klasse.
          </Text>
        ) : (
          <>
            <View style={styles.table}>
              <View fixed>
                <View style={styles.semesterRow}>
                  <View style={styles.semesterSpacer} />
                  {semesters.map((semester, idx) => (
                    <View key={semester.key} style={{ flexDirection: 'row' }}>
                      {idx > 0 ? <View style={styles.gutter} /> : null}
                      <View
                        style={[
                          styles.semesterTitle,
                          { width: SEMESTER_WIDTH, backgroundColor: semester.theme.tint },
                        ]}
                      >
                        <Text style={[styles.semesterTitleText, { color: semester.theme.ink }]}>
                          {semester.label}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.headRow}>
                  <View style={[styles.headCell, { width: COL_NR }]}>
                    <Text style={styles.headTextCenter}>Nr</Text>
                  </View>
                  <View style={[styles.headCell, { width: COL_GROUP }]}>
                    <Text style={styles.headTextCenter}>Gr</Text>
                  </View>
                  <View style={[styles.headCell, { width: COL_NAME }]}>
                    <Text style={styles.headText}>Schüler/in</Text>
                  </View>
                  {semesters.map((semester, idx) => (
                    <View key={semester.key} style={{ flexDirection: 'row' }}>
                      {idx > 0 ? (
                        <View
                          style={[
                            styles.gutter,
                            { borderBottomWidth: 0.75, borderBottomColor: colors.lineStrong },
                          ]}
                        />
                      ) : null}
                      <SemesterHead
                        teachers={teachers}
                        teacherWidth={teacherWidth}
                        theme={semester.theme}
                      />
                    </View>
                  ))}
                </View>
              </View>

              {students.map((student, index) => {
                const palette = groupColor(student.groupId)
                return (
                  <View
                    key={student.id}
                    style={[styles.row, ...(index % 2 === 1 ? [styles.rowAlt] : [])]}
                    wrap={false}
                  >
                    <View style={[styles.cell, { width: COL_NR }]}>
                      <Text style={styles.nrText}>{index + 1}</Text>
                    </View>
                    <View style={[styles.cell, styles.groupCell, { width: COL_GROUP }]}>
                      {student.groupId != null ? (
                        <View style={[styles.groupChip, { backgroundColor: palette.tint }]}>
                          <Text style={[styles.groupChipText, { color: palette.ink }]}>
                            {student.groupId}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={[styles.cell, { width: COL_NAME }]}>
                      <Text style={styles.nameText}>
                        {student.lastName}, {student.firstName}
                      </Text>
                    </View>

                    {semesters.map((semester, semesterIdx) => {
                      const average = averageText(
                        computeAverage(data.grades[student.id], semester.key),
                      )
                      const final = finalGradeText(student.id, semester.key)
                      return (
                        <View key={semester.key} style={{ flexDirection: 'row' }}>
                          {semesterIdx > 0 ? <View style={styles.gutter} /> : null}
                          {teachers.map(teacher => {
                            const grade = gradeText(
                              data.grades[student.id]?.[teacher.id]?.[semester.key],
                            )
                            return (
                              <View key={teacher.id} style={[styles.cell, { width: teacherWidth }]}>
                                <Text
                                  style={grade.sentinel ? styles.gradeSentinel : styles.gradeText}
                                >
                                  {grade.text}
                                </Text>
                              </View>
                            )
                          })}
                          <View
                            style={[
                              styles.cell,
                              { width: COL_AVG, backgroundColor: colors.surfaceSunken },
                            ]}
                          >
                            <Text
                              style={
                                average.sentinel
                                  ? [styles.gradeSentinel, styles.faded]
                                  : styles.avgText
                              }
                            >
                              {average.text}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.cell,
                              { width: COL_FINAL, backgroundColor: semester.theme.tint },
                            ]}
                          >
                            <Text
                              style={
                                final.sentinel
                                  ? [styles.gradeSentinel, { color: semester.theme.ink }]
                                  : [styles.finalText, { color: semester.theme.ink }]
                              }
                            >
                              {final.text}
                            </Text>
                          </View>
                          <View style={[styles.cell, { width: COL_CONDUCT }]}>
                            <Text style={styles.conductText}>
                              {conductText(student.id, semester.key)}
                            </Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                )
              })}
            </View>

            <View style={styles.legend} wrap={false}>
              <Text style={styles.legendLabel}>Lehrpersonen</Text>
              {teachers.map(teacher => (
                <View key={teacher.id} style={styles.legendItem}>
                  <Text style={styles.legendCode}>{teacherCode(teacher)}</Text>
                  <Text style={styles.legendName}>
                    {teacher.lastName} {teacher.firstName}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.legendNote}>
              n.b. = nicht beurteilt · gest. = gestunden · Ø = Notendurchschnitt (ohne n.b./gest.) ·
              Endn. = Endnote
            </Text>
            <Text style={styles.legendNote}>
              Betr. = Betragensnote (Wunsch): SZ = sehr zufriedenstellend · Z = zufriedenstellend ·
              WZ = wenig zufriedenstellend · NZ = nicht zufriedenstellend
            </Text>
          </>
        )}

        <PageFooter createdAt={formatDateGerman(new Date())} />
      </Page>
    </Document>
  )
}
