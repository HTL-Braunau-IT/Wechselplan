import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { colors, fonts, page } from '@/lib/pdf/theme'
import { PageFooter, PageHeader, Meta } from './pdf/primitives'
import { formatDateGerman } from '@/lib/pdf-helpers'

interface Week {
  date: string
  week: string
  isHoliday?: boolean
}
interface Turnus {
  name: string
  weeks: Week[]
  holidays?: unknown[]
}
export type ScheduleData = Record<string, Turnus>

const MARGIN_X = 24
const CONTENT_WIDTH = page.a4Landscape.width - MARGIN_X * 2
/** Two or three turnus columns should not stretch into banners. */
const MAX_COLUMN_WIDTH = 120
/**
 * Vertical space left for the grid once header, legend and page footer are
 * accounted for. Short turnus lists get taller rows rather than a shrunken
 * table stranded at the top of an empty sheet.
 */
const GRID_HEIGHT = 430
const MIN_ROW_HEIGHT = 22
const MAX_ROW_HEIGHT = 34

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
    alignSelf: 'flex-start',
  },

  headRow: { flexDirection: 'row' },
  headCell: {
    backgroundColor: colors.brand,
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    // A solid tint, not white-with-alpha: react-pdf renders translucent borders
    // as a muddy off-colour rather than blending them.
    borderRightColor: '#4B7BE5',
  },
  headTitle: { ...fonts.bold, fontSize: 8, color: colors.surface, letterSpacing: 0.4 },
  headMeta: {
    ...fonts.regular,
    fontSize: 5.8,
    color: colors.surface,
    opacity: 0.85,
    marginTop: 1,
  },

  row: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: colors.line },
  rowAlt: { backgroundColor: colors.surfaceAlt },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    borderRightColor: colors.line,
  },
  cellHoliday: { backgroundColor: '#FFE4E6' },
  weekText: { ...fonts.bold, fontSize: 7.5, color: colors.ink },
  weekTextHoliday: { ...fonts.bold, fontSize: 7.5, color: colors.danger },
  dateText: { ...fonts.regular, fontSize: 6.2, color: colors.muted, marginTop: 1 },
  dateTextHoliday: { ...fonts.regular, fontSize: 6.2, color: colors.danger, marginTop: 1 },

  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  legendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 2,
    backgroundColor: '#FFE4E6',
    borderWidth: 0.5,
    borderColor: colors.danger,
    marginRight: 4,
  },
  legendText: { ...fonts.regular, fontSize: 6.2, color: colors.muted },

  empty: { ...fonts.italic, fontSize: 8, color: colors.faint, marginTop: 16 },
})

/**
 * Calendar view behind a rotation plan: one column per turnus, listing the
 * teaching weeks it spans. Holiday weeks are called out in red so the turnus
 * boundaries can be checked against the school calendar at a glance.
 */
export default function ScheduleTurnusPDF({
  scheduleData,
  className,
  weekdayString,
}: {
  scheduleData: ScheduleData
  className: string
  weekdayString: string
}) {
  const turnusKeys = Object.keys(scheduleData)
  const maxRows = turnusKeys.length
    ? Math.max(...turnusKeys.map(key => scheduleData[key]?.weeks?.length ?? 0))
    : 0
  const columnWidth = turnusKeys.length
    ? Math.min(MAX_COLUMN_WIDTH, CONTENT_WIDTH / turnusKeys.length)
    : 0
  const rowHeight = maxRows
    ? Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, GRID_HEIGHT / maxRows))
    : MIN_ROW_HEIGHT

  const holidayCount = turnusKeys.reduce(
    (sum, key) => sum + (scheduleData[key]?.weeks?.filter(w => w.isHoliday).length ?? 0),
    0,
  )
  const totalWeeks = turnusKeys.reduce(
    (sum, key) => sum + (scheduleData[key]?.weeks?.length ?? 0),
    0,
  )
  const createdAt = formatDateGerman(new Date())

  return (
    <Document
      title={`Unterrichtstage ${className}`}
      author="Wechselplan"
      subject={`Unterrichtstage ${className}`}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <PageHeader
          title="Unterrichtstage"
          subtitle={`${className} · jeweils ${weekdayString}`}
          meta={
            <>
              <Meta label="Turnusse" value={String(turnusKeys.length)} />
              <Meta label="Wochen gesamt" value={String(totalWeeks)} />
              <Meta label="Stand" value={createdAt} />
            </>
          }
        />

        {turnusKeys.length === 0 || maxRows === 0 ? (
          <Text style={styles.empty}>Für diese Klasse sind keine Turnusse hinterlegt.</Text>
        ) : (
          <>
            <View style={styles.table}>
              <View style={styles.headRow}>
                {turnusKeys.map(key => (
                  <View key={key} style={[styles.headCell, { width: columnWidth }]}>
                    <Text style={styles.headTitle}>{key}</Text>
                    <Text style={styles.headMeta}>
                      {scheduleData[key]?.weeks?.length ?? 0} Wochen
                    </Text>
                  </View>
                ))}
              </View>

              {Array.from({ length: maxRows }).map((_, rowIdx) => (
                <View
                  key={rowIdx}
                  style={[styles.row, ...(rowIdx % 2 === 1 ? [styles.rowAlt] : [])]}
                  wrap={false}
                >
                  {turnusKeys.map(key => {
                    const week = scheduleData[key]?.weeks?.[rowIdx]
                    return (
                      <View
                        key={key}
                        style={[
                          styles.cell,
                          { width: columnWidth, height: rowHeight },
                          ...(week?.isHoliday ? [styles.cellHoliday] : []),
                        ]}
                      >
                        {week ? (
                          <>
                            <Text style={week.isHoliday ? styles.weekTextHoliday : styles.weekText}>
                              {week.week || '–'}
                            </Text>
                            {week.date ? (
                              <Text
                                style={week.isHoliday ? styles.dateTextHoliday : styles.dateText}
                              >
                                {week.date}
                              </Text>
                            ) : null}
                          </>
                        ) : null}
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>

            {holidayCount > 0 ? (
              <View style={styles.legend}>
                <View style={styles.legendSwatch} />
                <Text style={styles.legendText}>
                  Ferien oder Feiertag — kein Unterricht ({holidayCount}{' '}
                  {holidayCount === 1 ? 'Woche' : 'Wochen'})
                </Text>
              </View>
            ) : null}
          </>
        )}

        <PageFooter createdAt={createdAt} />
      </Page>
    </Document>
  )
}
