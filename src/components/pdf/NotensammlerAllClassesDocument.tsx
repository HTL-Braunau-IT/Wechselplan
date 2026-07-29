import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { colors, fonts, groupColor, page } from '@/lib/pdf/theme'
import { Meta, PageFooter, PageHeader } from './primitives'
import { formatDateGerman } from '@/lib/pdf-helpers'
import { truncateSubject } from '@/lib/subject-utils'
import { GESTUNDEN, NICHT_BEURTEILT } from '@/lib/grades'

export interface NotensammlerAllClassesClassData {
  className: string
  subjectName?: string
  students: Array<{ id: number; firstName: string; lastName: string; groupId: number | null }>
  grades: Record<number, { first: number | null; second: number | null }>
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

export interface NotensammlerAllClassesData {
  teacherName: string
  classes: NotensammlerAllClassesClassData[]
}

/**
 * One teacher's own marks across every class they teach. Four classes fit side
 * by side on an A4 landscape sheet with room for ~36 students each, which is
 * the tallest class this school runs.
 */
const MARGIN_X = 24
const CONTENT_WIDTH = page.a4Landscape.width - MARGIN_X * 2
const CLASSES_PER_PAGE = 4
const COLUMN_GAP = 10
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP * (CLASSES_PER_PAGE - 1)) / CLASSES_PER_PAGE

const COL_NR = 15
const COL_GROUP = 16
const COL_SEM = 21
const COL_NAME = COLUMN_WIDTH - COL_NR - COL_GROUP - COL_SEM * 2 - 1.5

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 34,
    paddingHorizontal: MARGIN_X,
    backgroundColor: colors.surface,
    fontFamily: fonts.sans,
    color: colors.ink,
  },

  columns: { flexDirection: 'row', marginTop: 12, alignItems: 'flex-start' },
  card: {
    width: COLUMN_WIDTH,
    borderWidth: 0.75,
    borderColor: colors.lineStrong,
    borderRadius: 3,
    overflow: 'hidden',
  },
  cardHead: {
    backgroundColor: colors.brand,
    paddingVertical: 3.5,
    paddingHorizontal: 5,
  },
  cardTitle: { fontFamily: fonts.sansBold, fontSize: 8, color: colors.surface, letterSpacing: 0.3 },
  cardSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 6,
    color: colors.surface,
    opacity: 0.85,
    marginTop: 1,
  },

  headRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.lineStrong,
  },
  headCell: {
    paddingVertical: 2.5,
    paddingHorizontal: 2,
    borderRightWidth: 0.5,
    borderRightColor: colors.line,
  },
  headText: {
    fontFamily: fonts.sansBold,
    fontSize: 5.8,
    letterSpacing: 0.3,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  headTextCenter: {
    fontFamily: fonts.sansBold,
    fontSize: 5.8,
    color: colors.inkSoft,
    textAlign: 'center',
  },

  row: { flexDirection: 'row', alignItems: 'stretch', minHeight: 11.5 },
  rowAlt: { backgroundColor: colors.surfaceAlt },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 1.2,
    borderRightWidth: 0.5,
    borderRightColor: colors.line,
  },
  nrText: { fontFamily: fonts.sans, fontSize: 5.8, color: colors.faint, textAlign: 'center' },
  nameText: { fontFamily: fonts.sans, fontSize: 6.8, color: colors.ink },
  groupCell: { alignItems: 'center', justifyContent: 'center' },
  groupChip: {
    width: 11,
    height: 9,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupChipText: { fontFamily: fonts.sansBold, fontSize: 5.5 },
  gradeText: { fontFamily: fonts.sansBold, fontSize: 7.5, color: colors.ink, textAlign: 'center' },
  gradeSentinel: {
    fontFamily: fonts.sans,
    fontSize: 5.5,
    color: colors.muted,
    textAlign: 'center',
  },

  cardEmpty: {
    fontFamily: fonts.sansItalic,
    fontSize: 6.5,
    color: colors.faint,
    padding: 6,
    textAlign: 'center',
  },
  legendNote: { fontFamily: fonts.sansItalic, fontSize: 6, color: colors.muted, marginTop: 8 },
})

function gradeText(grade: number | null | undefined): { text: string; sentinel: boolean } {
  if (grade == null) return { text: '', sentinel: false }
  if (grade === NICHT_BEURTEILT) return { text: 'n.b.', sentinel: true }
  if (grade === GESTUNDEN) return { text: 'gest.', sentinel: true }
  return { text: String(grade).replace('.', ','), sentinel: false }
}

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages.length ? pages : [[]]
}

function ClassCard({ classData }: { classData: NotensammlerAllClassesClassData }) {
  const students = [...classData.students]
    .filter(student => student.groupId != null)
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))

  return (
    <View style={styles.card} wrap={false}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{classData.className}</Text>
        {classData.subjectName ? (
          <Text style={styles.cardSubtitle}>{truncateSubject(classData.subjectName)}</Text>
        ) : null}
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
        <View style={[styles.headCell, { width: COL_SEM }]}>
          <Text style={styles.headTextCenter}>1. Sem</Text>
        </View>
        <View style={[styles.headCell, { width: COL_SEM }]}>
          <Text style={styles.headTextCenter}>2. Sem</Text>
        </View>
      </View>

      {students.length === 0 ? (
        <Text style={styles.cardEmpty}>Keine Schüler mit Gruppenzuteilung</Text>
      ) : (
        students.map((student, index) => {
          const palette = groupColor(student.groupId)
          const first = gradeText(classData.grades[student.id]?.first)
          const second = gradeText(classData.grades[student.id]?.second)
          return (
            <View
              key={student.id}
              style={[styles.row, ...(index % 2 === 1 ? [styles.rowAlt] : [])]}
            >
              <View style={[styles.cell, { width: COL_NR }]}>
                <Text style={styles.nrText}>{index + 1}</Text>
              </View>
              <View style={[styles.cell, styles.groupCell, { width: COL_GROUP }]}>
                <View style={[styles.groupChip, { backgroundColor: palette.tint }]}>
                  <Text style={[styles.groupChipText, { color: palette.ink }]}>
                    {student.groupId}
                  </Text>
                </View>
              </View>
              <View style={[styles.cell, { width: COL_NAME }]}>
                <Text style={styles.nameText}>
                  {student.lastName}, {student.firstName}
                </Text>
              </View>
              <View style={[styles.cell, { width: COL_SEM }]}>
                <Text style={first.sentinel ? styles.gradeSentinel : styles.gradeText}>
                  {first.text}
                </Text>
              </View>
              <View style={[styles.cell, { width: COL_SEM }]}>
                <Text style={second.sentinel ? styles.gradeSentinel : styles.gradeText}>
                  {second.text}
                </Text>
              </View>
            </View>
          )
        })
      )}
    </View>
  )
}

export default function NotensammlerAllClassesDocument({
  data,
}: {
  data: NotensammlerAllClassesData
}) {
  const pages = chunk(data.classes, CLASSES_PER_PAGE)
  const createdAt = formatDateGerman(new Date())

  return (
    <Document
      title={`Notensammler ${data.teacherName}`}
      author="Wechselplan"
      subject="Notensammler — alle Klassen"
    >
      {pages.map((classesOnPage, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation="landscape" style={styles.page}>
          <PageHeader
            title="Notensammler"
            subtitle={`${data.teacherName} · alle Klassen`}
            meta={
              <>
                <Meta label="Klassen" value={String(data.classes.length)} />
                <Meta label="Stand" value={createdAt} />
              </>
            }
          />

          <View style={styles.columns}>
            {classesOnPage.map((classData, index) => (
              <View
                key={`${classData.className}-${index}`}
                style={index > 0 ? { marginLeft: COLUMN_GAP } : undefined}
              >
                <ClassCard classData={classData} />
              </View>
            ))}
          </View>

          <Text style={styles.legendNote}>n.b. = nicht beurteilt · gest. = gestunden</Text>

          <PageFooter createdAt={createdAt} />
        </Page>
      ))}
    </Document>
  )
}
