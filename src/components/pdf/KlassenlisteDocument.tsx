import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { colors, fonts, groupColor } from '@/lib/pdf/theme'
import { PageFooter, PageHeader, Meta, GroupBadge } from './primitives'
import { formatDateGerman } from '@/lib/pdf-helpers'
import { UNGROUPED_SECTION_ID, type WritingSpace } from '@/lib/klassenliste'

interface Person {
  firstName: string
  lastName: string
}
interface Section {
  id: number
  students: Person[]
}

export interface KlassenlisteData {
  className: string
  schoolYearLabel: string
  classHead: string | null
  classLead: string | null
  /** How much blank writing area to print beside each name. */
  space: WritingSpace
  hasPlan: boolean
  /** Group sections (plus a trailing ungrouped one) when the class has a plan. */
  sections: Section[]
  /** All students as one flat list when the class has no plan. */
  plain: Person[]
  total: number
  createdAt: string
}

const MARGIN_X = 24 // matches the fixed PageFooter primitive (left/right: 24)
const NAME_COL = 160
const TICKS = 10
/** Fixed tick-column width in the "split" layout; the rest is free notes space. */
const SPLIT_TICK = 20

const styles = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 34,
    paddingHorizontal: MARGIN_X,
    backgroundColor: colors.surface,
    ...fonts.regular,
    color: colors.ink,
  },

  body: { marginTop: 12 },

  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 15,
    paddingHorizontal: 6,
    marginTop: 9,
    borderTopWidth: 1.5,
    borderTopColor: colors.lineStrong,
  },
  groupTitle: { ...fonts.bold, fontSize: 7.5, letterSpacing: 0.3 },
  groupCount: { ...fonts.regular, fontSize: 6.2, marginLeft: 'auto' },

  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 20.5,
    borderBottomWidth: 0.75,
    borderBottomColor: colors.line,
  },
  nameCell: {
    flexDirection: 'row',
    alignItems: 'center',
    width: NAME_COL,
    paddingHorizontal: 6,
  },
  nr: { ...fonts.regular, width: 12, fontSize: 6.2, color: colors.faint },
  name: { ...fonts.regular, fontSize: 8.5, color: colors.ink },
  rowBadge: { width: 12, height: 10, marginRight: 4 },

  writeBlock: {
    flexDirection: 'row',
    flex: 1,
    borderLeftWidth: 0.75,
    borderLeftColor: colors.line,
  },
  tickCol: { flex: 1, borderRightWidth: 0.75, borderRightColor: colors.line },
  splitTick: { width: SPLIT_TICK, borderRightWidth: 0.75, borderRightColor: colors.line },
  splitNotes: { flex: 1 },

  empty: { ...fonts.italic, fontSize: 9, color: colors.faint, marginTop: 16 },
})

/** The blank area to the right of a name, per the chosen writing-space layout. */
function WriteArea({ space }: { space: WritingSpace }) {
  if (space === 'blank') return null
  if (space === 'notes') return <View style={styles.writeBlock} />
  if (space === 'split') {
    return (
      <View style={styles.writeBlock}>
        {Array.from({ length: TICKS }).map((_, i) => (
          <View key={i} style={styles.splitTick} />
        ))}
        <View style={styles.splitNotes} />
      </View>
    )
  }
  // columns
  return (
    <View style={styles.writeBlock}>
      {Array.from({ length: TICKS }).map((_, i) => (
        <View key={i} style={styles.tickCol} />
      ))}
    </View>
  )
}

function StudentRow({
  nr,
  name,
  groupId,
  space,
}: {
  nr: number
  name: string
  groupId: number | null
  space: WritingSpace
}) {
  return (
    <View style={styles.row} wrap={false}>
      <View style={styles.nameCell}>
        <Text style={styles.nr}>{nr}</Text>
        {groupId != null ? (
          <GroupBadge groupId={groupId} style={styles.rowBadge} />
        ) : null}
        <Text style={styles.name}>{name}</Text>
      </View>
      <WriteArea space={space} />
    </View>
  )
}

const personName = (p: Person) => `${p.lastName} ${p.firstName}`

const sectionTitle = (id: number) => (id === UNGROUPED_SECTION_ID ? 'Ohne Gruppe' : `Gruppe ${id}`)

/**
 * Printable class list: one class's roster split into its Wechselplan rotation
 * groups, with a chosen amount of blank writing space per student (tick columns,
 * tick columns plus a notes lane, a plain notes lane, or nothing). A class with
 * no plan prints as one flat, ungrouped list.
 */
export default function KlassenlisteDocument({ data }: { data: KlassenlisteData }) {
  const { className, schoolYearLabel, classHead, classLead, space, hasPlan, sections, plain } = data

  const groupSummary = hasPlan
    ? `Gruppen ${sections.map(s => (s.id === UNGROUPED_SECTION_ID ? 'ohne' : String(s.id))).join(', ') || '—'}`
    : 'ohne Gruppen'

  return (
    <Document
      title={`Klassenliste ${className}`}
      author="Wechselplan"
      subject={`Klassenliste ${className}`}
    >
      <Page size="A4" orientation="portrait" style={styles.page}>
        <PageHeader
          title="Klassenliste"
          subtitle={`${className} · Schuljahr ${schoolYearLabel} · ${groupSummary}`}
          meta={
            <>
              <Meta label="Erstellt am" value={data.createdAt} />
              <Meta label="Klassenvorstand" value={classHead ?? '—'} />
              <Meta label="Klassenleitung" value={classLead ?? '—'} />
              <Meta label="Schüler" value={`${data.total}`} />
            </>
          }
        />

        {data.total === 0 ? (
          <Text style={styles.empty}>Für diese Auswahl sind keine Schüler vorhanden.</Text>
        ) : (
          <View style={styles.body}>
            {hasPlan
              ? sections.map(section => {
                  const palette = groupColor(section.id)
                  return (
                    <View key={section.id}>
                      <View
                        style={[styles.groupHeader, { backgroundColor: palette.tint }]}
                        wrap={false}
                      >
                        {section.id === UNGROUPED_SECTION_ID ? null : (
                          <GroupBadge groupId={section.id} style={{ marginRight: 6 }} />
                        )}
                        <Text style={[styles.groupTitle, { color: palette.ink }]}>
                          {sectionTitle(section.id)}
                        </Text>
                        <Text style={[styles.groupCount, { color: palette.ink }]}>
                          {section.students.length} Schüler
                        </Text>
                      </View>
                      {section.students.map((student, i) => (
                        <StudentRow
                          key={i}
                          nr={i + 1}
                          name={personName(student)}
                          groupId={section.id === UNGROUPED_SECTION_ID ? null : section.id}
                          space={space}
                        />
                      ))}
                    </View>
                  )
                })
              : plain.map((student, i) => (
                  <StudentRow
                    key={i}
                    nr={i + 1}
                    name={personName(student)}
                    groupId={null}
                    space={space}
                  />
                ))}
          </View>
        )}

        <PageFooter createdAt={formatDateGerman(new Date())} />
      </Page>
    </Document>
  )
}
