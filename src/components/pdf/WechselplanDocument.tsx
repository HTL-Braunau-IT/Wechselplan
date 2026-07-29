import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { colors, fonts, groupColor, page } from '@/lib/pdf/theme'
import { GroupBadge, Meta, PageFooter, PageHeader, SectionLabel } from './primitives'
import {
  formatDateGerman,
  getSchoolYear,
  getTurnusInfo,
  getWeekEndLabel,
  getWeekStartLabel,
  getWeekdayName,
} from '@/lib/pdf-helpers'

export interface WechselplanData {
  groups: Array<{
    id: number
    students: Array<{ firstName: string; lastName: string }>
  }>
  amAssignments: Assignment[]
  pmAssignments: Assignment[]
  turns: Record<string, unknown>
  className: string
  classHead: string
  classLead: string
  additionalInfo: string
  selectedWeekday: number
  scheduleTimes: Array<{ startTime: string; endTime: string; period?: string; hours?: number }>
  breakTimes: Array<{ name?: string; startTime: string; endTime: string; period: string }>
  updatedAt: Date
}

interface Assignment {
  teacherFirstName: string
  teacherLastName: string
  subjectName: string
  learningContentName: string
  roomName: string
  groupId: number
}

/**
 * A rotation plan is read across the page: the worst realistic case is 4 groups
 * of 12 students, 4 teachers in the morning and 4 in the afternoon, spread over
 * 8 turnus columns. Everything below is budgeted against that shape on a single
 * A4 landscape sheet, so the plan never needs a second page in normal use.
 */
const MARGIN_X = 24
const CONTENT_WIDTH = page.a4Landscape.width - MARGIN_X * 2

/** Label columns of the assignment grid, in pt. The rest goes to the turnus columns. */
const COL_TEACHER = 112
const COL_SUBJECT = 104
const COL_CONTENT = 104
const COL_ROOM = 46
const LABEL_WIDTH = COL_TEACHER + COL_SUBJECT + COL_CONTENT + COL_ROOM

const MAX_TURNUS = 8

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 32,
    paddingHorizontal: MARGIN_X,
    backgroundColor: colors.surface,
    ...fonts.regular,
    color: colors.ink,
  },

  band: { marginTop: 7 },
  bandHeading: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 5 },
  bandHint: { ...fonts.regular, fontSize: 6.5, color: colors.faint, marginLeft: 8 },

  /* --- Gruppeneinteilung --- */
  groupRow: { flexDirection: 'row' },
  groupCard: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 0.75,
    borderColor: colors.line,
    borderRadius: 3,
    overflow: 'hidden',
  },
  groupCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3.4,
    paddingHorizontal: 6,
  },
  groupCardTitle: {
    ...fonts.bold,
    fontSize: 8.2,
    color: colors.surface,
    marginLeft: 5,
    letterSpacing: 0.4,
  },
  groupCardCount: {
    ...fonts.regular,
    fontSize: 6.5,
    color: colors.surface,
    marginLeft: 'auto',
    opacity: 0.85,
  },
  studentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 1.9, paddingLeft: 6 },
  studentIndex: {
    ...fonts.regular,
    fontSize: 6.4,
    color: colors.faint,
    width: 13,
  },
  studentName: { ...fonts.regular, fontSize: 7.8, color: colors.ink },
  studentEmpty: { ...fonts.regular, fontSize: 7.8, color: colors.faint },

  /* --- Einsatzplan grid --- */
  grid: { borderWidth: 0.75, borderColor: colors.lineStrong, borderRadius: 3, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'stretch' },
  headLabelCell: {
    justifyContent: 'flex-end',
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRightWidth: 0.5,
    borderRightColor: colors.line,
  },
  headLabelText: {
    ...fonts.bold,
    fontSize: 7,
    letterSpacing: 0.5,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  headTurnusCell: {
    backgroundColor: colors.brandTint,
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 2,
    borderLeftWidth: 0.5,
    borderLeftColor: colors.line,
  },
  headTurnusTitle: { ...fonts.bold, fontSize: 8, color: colors.brandInk },
  headTurnusDates: { ...fonts.regular, fontSize: 6.4, color: colors.inkSoft, marginTop: 2 },
  headTurnusMeta: { ...fonts.regular, fontSize: 6, color: colors.muted, marginTop: 1.5 },

  periodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand,
    paddingVertical: 3.4,
    paddingHorizontal: 6,
  },
  periodName: {
    ...fonts.bold,
    fontSize: 8.2,
    letterSpacing: 1,
    color: colors.surface,
    textTransform: 'uppercase',
  },
  periodTime: { ...fonts.regular, fontSize: 7.6, color: colors.surface, marginLeft: 9 },
  periodBreak: {
    ...fonts.regular,
    fontSize: 6.2,
    color: colors.surface,
    marginLeft: 'auto',
    opacity: 0.85,
  },

  bodyRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 0.5,
    borderTopColor: colors.line,
  },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3.9,
    borderRightWidth: 0.5,
    borderRightColor: colors.line,
  },
  teacherName: { ...fonts.bold, fontSize: 8, color: colors.ink },
  cellText: { ...fonts.regular, fontSize: 7.4, color: colors.inkSoft },
  cellTextCenter: {
    ...fonts.regular,
    fontSize: 7.4,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  groupCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 0.5,
    borderLeftColor: colors.surface,
  },
  groupCellText: { ...fonts.bold, fontSize: 11 },

  /* --- footer strip --- */
  footerStrip: { flexDirection: 'row', marginTop: 8, alignItems: 'stretch' },
  infoBox: {
    borderWidth: 0.75,
    borderColor: colors.line,
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 7,
    justifyContent: 'center',
  },
  breakLabel: {
    ...fonts.bold,
    fontSize: 6,
    letterSpacing: 0.7,
    color: colors.faint,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  breakList: { flexDirection: 'row', alignItems: 'center' },
  breakItem: { marginRight: 12 },
  breakItemName: { ...fonts.regular, fontSize: 6.2, color: colors.muted },
  breakItemTime: { ...fonts.bold, fontSize: 7.2, color: colors.inkSoft },
  noteBox: {
    flexGrow: 1,
    flexBasis: 0,
    marginLeft: 10,
    backgroundColor: colors.warnTint,
    borderWidth: 0.75,
    borderColor: '#FDE68A',
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 7,
    justifyContent: 'center',
  },
  noteLabel: {
    ...fonts.bold,
    fontSize: 6,
    letterSpacing: 0.7,
    color: colors.warnInk,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  noteText: { ...fonts.regular, fontSize: 7, color: colors.ink, lineHeight: 1.35 },

  empty: { ...fonts.italic, fontSize: 7, color: colors.faint, paddingVertical: 8 },
})

/**
 * Returns the group a teacher supervises in a given turn.
 * Groups rotate one position per turn, so teacher *i* in turn *t* takes the
 * group that started at index *i + t*.
 */
function getGroupForTeacherAndTurn(
  groups: WechselplanData['groups'],
  teacherIdx: number,
  turnIdx: number,
  assignments: Assignment[],
): { id: number } | null {
  if (!groups.length || !assignments[teacherIdx]) return null
  return groups[(teacherIdx + turnIdx) % groups.length] ?? null
}

/** "07:50 – 12:30" across all lesson slots of a period. */
function periodTimeRange(scheduleTimes: WechselplanData['scheduleTimes'], period: 'AM' | 'PM') {
  const times = scheduleTimes.filter(t => t.period === period)
  const first = times[0]
  const last = times[times.length - 1]
  if (!first || !last) return ''
  return `${first.startTime} – ${last.endTime}`
}

function breakFor(breakTimes: WechselplanData['breakTimes'], period: 'AM' | 'PM' | 'LUNCH') {
  const match = breakTimes.find(bt => bt.period === period)
  return match ? `${match.startTime} – ${match.endTime}` : ''
}

interface TurnusColumn {
  label: string
  range: string
  meta: string
}

function buildTurnusColumns(turns: Record<string, unknown>): TurnusColumn[] {
  return Object.keys(turns)
    .sort()
    .slice(0, MAX_TURNUS)
    .map((turnKey, idx) => {
      const info = getTurnusInfo(turnKey, turns)
      const start = getWeekStartLabel(info.start || info.startFormatted || '')
      const end = getWeekEndLabel(info.end || info.endFormatted || '')

      const kw =
        info.startKW && info.endKW
          ? `KW ${info.startKW}–${info.endKW}`
          : info.startKW || info.endKW
            ? `KW ${info.startKW || info.endKW}`
            : ''
      const weeks = info.days > 0 ? `${info.days} UW` : ''

      return {
        label: `Turnus ${idx + 1}`,
        range: start && end ? `${start} – ${end}` : start || end,
        meta: [kw, weeks].filter(Boolean).join(' · '),
      }
    })
}

function GroupCards({ groups }: { groups: WechselplanData['groups'] }) {
  const maxStudents = Math.max(0, ...groups.map(g => g.students.length))

  return (
    <View style={styles.groupRow} wrap={false}>
      {groups.map((group, idx) => {
        const palette = groupColor(group.id)
        return (
          <View key={group.id} style={[styles.groupCard, ...(idx > 0 ? [{ marginLeft: 8 }] : [])]}>
            <View style={[styles.groupCardHead, { backgroundColor: palette.accent }]}>
              <GroupBadge groupId={group.id} style={{ backgroundColor: palette.ink }} />
              <Text style={styles.groupCardTitle}>Gruppe {group.id}</Text>
              <Text style={styles.groupCardCount}>{group.students.length} Schüler</Text>
            </View>

            {Array.from({ length: maxStudents }).map((_, i) => {
              const student = group.students[i]
              return (
                <View
                  key={i}
                  style={[
                    styles.studentRow,
                    ...(i % 2 === 1 ? [{ backgroundColor: palette.tint }] : []),
                  ]}
                >
                  <Text style={styles.studentIndex}>{i + 1}</Text>
                  {student ? (
                    <Text style={styles.studentName}>
                      {student.lastName} {student.firstName}
                    </Text>
                  ) : (
                    <Text style={styles.studentEmpty}>–</Text>
                  )}
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

function PeriodRows({
  assignments,
  groups,
  turnusColumns,
  turnusWidth,
}: {
  assignments: Assignment[]
  groups: WechselplanData['groups']
  turnusColumns: TurnusColumn[]
  turnusWidth: number
}) {
  return (
    <>
      {assignments.map((assignment, teacherIdx) => (
        <View key={teacherIdx} style={styles.bodyRow}>
          <View style={[styles.cell, { width: COL_TEACHER }]}>
            <Text style={styles.teacherName}>
              {assignment.teacherLastName} {assignment.teacherFirstName}
            </Text>
          </View>
          <View style={[styles.cell, { width: COL_SUBJECT }]}>
            <Text style={styles.cellText}>{assignment.subjectName || '–'}</Text>
          </View>
          <View style={[styles.cell, { width: COL_CONTENT }]}>
            <Text style={styles.cellText}>{assignment.learningContentName || '–'}</Text>
          </View>
          <View style={[styles.cell, { width: COL_ROOM }]}>
            <Text style={styles.cellTextCenter}>{assignment.roomName || '–'}</Text>
          </View>

          {turnusColumns.map((_, turnIdx) => {
            const group = getGroupForTeacherAndTurn(groups, teacherIdx, turnIdx, assignments)
            const palette = groupColor(group?.id)
            return (
              <View
                key={turnIdx}
                style={[
                  styles.groupCell,
                  { width: turnusWidth, backgroundColor: group ? palette.tint : colors.surface },
                ]}
              >
                <Text style={[styles.groupCellText, { color: palette.ink }]}>
                  {group ? group.id : ''}
                </Text>
              </View>
            )
          })}
        </View>
      ))}
    </>
  )
}

/**
 * The rotation plan itself: who teaches which group, in which workshop, in each
 * turnus of the school year.
 */
export default function WechselplanDocument({ data }: { data: WechselplanData }) {
  const weekdayName = getWeekdayName(data.selectedWeekday)
  const schoolYear = getSchoolYear(data.updatedAt)
  const turnusColumns = buildTurnusColumns(data.turns)
  const turnusWidth = turnusColumns.length
    ? (CONTENT_WIDTH - LABEL_WIDTH) / turnusColumns.length
    : 0

  const breaks = [
    { name: 'Vormittag', time: breakFor(data.breakTimes, 'AM') },
    { name: 'Mittag', time: breakFor(data.breakTimes, 'LUNCH') },
    { name: 'Nachmittag', time: breakFor(data.breakTimes, 'PM') },
  ].filter(b => b.time)

  const hasNote = Boolean(data.additionalInfo && data.additionalInfo !== '—')

  const periods = [
    { key: 'AM' as const, name: 'Vormittag', assignments: data.amAssignments },
    { key: 'PM' as const, name: 'Nachmittag', assignments: data.pmAssignments },
  ].filter(p => p.assignments.length > 0)

  return (
    <Document
      title={`Wechselplan ${data.className} ${schoolYear}`}
      author="Wechselplan"
      subject={`Wechselplan ${data.className}`}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <PageHeader
          title={`Wechselplan ${data.className}`}
          subtitle={`Schuljahr ${schoolYear} · Wechseltag ${weekdayName}`}
          meta={
            <>
              <Meta label="Klassenvorstand" value={data.classHead} />
              <Meta label="Klassenleiter" value={data.classLead} />
              <Meta label="Stand" value={formatDateGerman(data.updatedAt)} />
            </>
          }
        />

        <View style={styles.band}>
          <View style={styles.bandHeading}>
            <SectionLabel>Gruppeneinteilung</SectionLabel>
            <Text style={styles.bandHint}>
              {data.groups.reduce((sum, g) => sum + g.students.length, 0)} Schüler in{' '}
              {data.groups.length} Gruppen
            </Text>
          </View>
          {data.groups.length > 0 ? (
            <GroupCards groups={data.groups} />
          ) : (
            <Text style={styles.empty}>Keine Gruppen eingeteilt.</Text>
          )}
        </View>

        <View style={styles.band}>
          <View style={styles.bandHeading}>
            <SectionLabel>Turnusplan</SectionLabel>
            <Text style={styles.bandHint}>
              Zahl im Feld = Gruppe, die in diesem Turnus bei der Lehrperson ist
            </Text>
          </View>

          {periods.length > 0 && turnusColumns.length > 0 ? (
            <View style={styles.grid}>
              <View style={styles.headRow}>
                <View style={[styles.headLabelCell, { width: COL_TEACHER }]}>
                  <Text style={styles.headLabelText}>Lehrer/in</Text>
                </View>
                <View style={[styles.headLabelCell, { width: COL_SUBJECT }]}>
                  <Text style={styles.headLabelText}>Werkstätte</Text>
                </View>
                <View style={[styles.headLabelCell, { width: COL_CONTENT }]}>
                  <Text style={styles.headLabelText}>Lehrinhalt</Text>
                </View>
                <View style={[styles.headLabelCell, { width: COL_ROOM }]}>
                  <Text style={styles.headLabelText}>Raum</Text>
                </View>
                {turnusColumns.map((col, idx) => (
                  <View key={idx} style={[styles.headTurnusCell, { width: turnusWidth }]}>
                    <Text style={styles.headTurnusTitle}>{col.label}</Text>
                    {col.range ? <Text style={styles.headTurnusDates}>{col.range}</Text> : null}
                    {col.meta ? <Text style={styles.headTurnusMeta}>{col.meta}</Text> : null}
                  </View>
                ))}
              </View>

              {periods.map(period => (
                <View key={period.key}>
                  <View style={styles.periodBar}>
                    <Text style={styles.periodName}>{period.name}</Text>
                    <Text style={styles.periodTime}>
                      {periodTimeRange(data.scheduleTimes, period.key)}
                    </Text>
                    {breakFor(data.breakTimes, period.key) ? (
                      <Text style={styles.periodBreak}>
                        Pause {breakFor(data.breakTimes, period.key)}
                      </Text>
                    ) : null}
                  </View>
                  <PeriodRows
                    assignments={period.assignments}
                    groups={data.groups}
                    turnusColumns={turnusColumns}
                    turnusWidth={turnusWidth}
                  />
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>Keine Turnus- oder Lehrerzuteilung vorhanden.</Text>
          )}
        </View>

        <View style={styles.footerStrip} wrap={false}>
          <View style={[styles.infoBox, ...(hasNote ? [] : [{ flexGrow: 1, flexBasis: 0 }])]}>
            <Text style={styles.breakLabel}>Pausenzeiten {weekdayName}</Text>
            <View style={styles.breakList}>
              {breaks.length > 0 ? (
                breaks.map(b => (
                  <View key={b.name} style={styles.breakItem}>
                    <Text style={styles.breakItemName}>{b.name}</Text>
                    <Text style={styles.breakItemTime}>{b.time}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.breakItemName}>keine hinterlegt</Text>
              )}
            </View>
          </View>

          {hasNote ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>Info</Text>
              <Text style={styles.noteText}>{data.additionalInfo}</Text>
            </View>
          ) : null}
        </View>

        <PageFooter createdAt={formatDateGerman(new Date())} />
      </Page>
    </Document>
  )
}
