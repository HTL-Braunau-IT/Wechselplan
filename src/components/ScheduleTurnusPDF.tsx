import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';

// Types for the schedule data
interface Week {
  date: string;
  week: string;
  isHoliday?: boolean;
}
interface Turnus {
  name: string;
  weeks: Week[];
  holidays?: unknown[];
}
export type ScheduleData = Record<string, Turnus>;

const styles = StyleSheet.create({
  page: { padding: 10, fontSize: 10 },
  title: {
    backgroundColor: '#FFFF00',
    color: '#000',
    fontWeight: 'bold',
    textAlign: 'center',
    padding: 4,
    fontSize: 14,
    marginBottom: 2,
  },
  table: { width: 'auto', borderStyle: 'solid', borderWidth: 1, borderRightWidth: 0, borderBottomWidth: 0 },
  tableRow: { flexDirection: 'row' },
  tableCol: { width: '10%', borderStyle: 'solid', borderWidth: 1, borderLeftWidth: 0, borderTopWidth: 0, minHeight: 24, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#00C000', color: '#000', fontWeight: 'bold', textAlign: 'center', padding: 2 },
  cell: { textAlign: 'center', padding: 2 },
  weekRed: { color: 'red' },
  small: { fontSize: 8 },
});

/**
 * Returns the maximum number of weeks among all turnus entries in the schedule data.
 *
 * @param turnusData - The schedule data mapping turnus names to their respective data.
 * @returns The highest count of weeks found in any turnus, or 0 if no data is present.
 */
function getMaxRows(turnusData: ScheduleData): number {
  const lengths = Object.values(turnusData).map(t => t.weeks.length);
  return lengths.length ? Math.max(...lengths) : 0;
}


/**
 * Renders a PDF document displaying a schedule table for multiple turnus groups.
 *
 * The table lists each turnus as a column, showing week labels and dates for each row. Holidays are highlighted in red. The table always displays 10 columns, filling with empty columns if there are fewer turnus groups.
 *
 * @param scheduleData - The schedule data mapping turnus names to their respective weeks.
 * @param className - The class name to display in the document title.
 * @param weekdayString - The weekday to display in the document title.
 *
 * @returns A React PDF document containing the formatted schedule table.
 */
export default function ScheduleTurnusPDF({ scheduleData, className, weekdayString }: { scheduleData: ScheduleData, className: string, weekdayString: string }) {
  const turnusKeys = Object.keys(scheduleData);
  const maxRows = getMaxRows(scheduleData);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={{ marginBottom: 6 }}>
          <Text style={styles.title}>Unterrichtstage am {weekdayString}  {className}</Text>
        </View>
        <View style={styles.table}>
          {/* Header Row */}
          <View style={styles.tableRow}>
            {turnusKeys.map((key) => (
              <View style={styles.tableCol} key={key}>
                <Text style={styles.header}>{key}</Text>
              </View>
            ))}
            {/* Fill up to 10 columns */}
            {[...Array(10 - turnusKeys.length)].map((_, idx) => (
              <View style={styles.tableCol} key={`empty-header-${idx}`}></View>
            ))}
          </View>
          {/* Data Rows */}
          {Array.from({ length: maxRows }).map((_, rowIdx) => (
            <View style={styles.tableRow} key={rowIdx}>
              {turnusKeys.map((turnus, colIdx) => {
                const week = scheduleData[turnus]?.weeks?.[rowIdx];
                if (!week) return <View style={styles.tableCol} key={colIdx}></View>;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const weekStyle: any = week.isHoliday ? [styles.cell, styles.weekRed] : styles.cell;
                return (
                  <View style={styles.tableCol} key={colIdx}>
                    <Text style={weekStyle}>
                      {week.week || ''}
                    </Text>
                    <Text style={styles.small}>{week.date || ''}</Text>
                  </View>
                );
              })}
              {/* Fill up to 10 columns */}
              {[...Array(10 - turnusKeys.length)].map((_, idx) => (
                <View style={styles.tableCol} key={`empty-cell-${rowIdx}-${idx}`}></View>
              ))}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
} 