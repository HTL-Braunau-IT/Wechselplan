// components/MyDocument.js
import { Document, Page, Text, StyleSheet, View } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 8,
    fontFamily: 'Helvetica',
  },
  section: {
    marginBottom: 20,
  },
  table: {
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCol: {
    borderStyle: 'solid',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    padding: 4,
    flexGrow: 1,
    textAlign: 'center',
  },
  tableHeader: {
    fontWeight: 'bold',
    backgroundColor: '#f3f4f6',
  },
  title: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
  },
});

/**
 * Renders a schedule table for a specified period, displaying teacher assignments and their group allocations for each turnus.
 *
 * The table includes columns for teacher, workshop, content, room, and one column per turnus period, showing the assigned group ID if available.
 *
 * @param {'AM'|'PM'} period - Indicates whether to render the morning ('AM') or afternoon ('PM') schedule.
 * @param {any[]} assignments - List of teacher assignment objects with subject and room details.
 * @param {Record<string, unknown>} turns - Object representing available turnus periods.
 * @param {(turnKey: string) => { start: string, end: string, days: number }} getTurnusInfo - Function to retrieve start and end dates for a turnus.
 * @param {(teacherIdx: number, turnIdx: number, period: 'AM'|'PM') => any} getGroupForTeacherAndTurn - Function to get the group assigned to a teacher for a specific turnus and period.
 * @param {{ id: number, students: { firstName: string, lastName: string }[] }[]} groups - Array of group objects with student information.
 * @param {any} styles - StyleSheet object for table styling.
 *
 *
 */
function renderScheduleTable(period, assignments, turns, getTurnusInfo, getGroupForTeacherAndTurn, groups, styles) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{period === 'AM' ? 'Vormittag' : 'Nachmittag'}</Text>
      <View style={styles.table}>
        <View style={styles.tableRow}>
          <Text style={{ ...styles.tableCol, ...styles.tableHeader, width: '10%' }}>Lehrer/in</Text>
          <Text style={{ ...styles.tableCol, ...styles.tableHeader, width: '10%' }}>Werkstätte</Text>
          <Text style={{ ...styles.tableCol, ...styles.tableHeader, width: '10%' }}>Lehrinhalt</Text>
          <Text style={{ ...styles.tableCol, ...styles.tableHeader, width: '10%' }}>Raum</Text>
          {Object.keys(turns).map((turn, turnIdx) => (
            <Text key={turn} style={{ ...styles.tableCol, ...styles.tableHeader, width: `${60 / Object.keys(turns).length}%` }}>
              Turnus {turnIdx + 1} ({getTurnusInfo(turn).start} - {getTurnusInfo(turn).end})
            </Text>
          ))}
        </View>
        {assignments.map((assignment, teacherIdx) => (
          <View style={styles.tableRow} key={assignment.teacherId}>
            <Text style={{ ...styles.tableCol, width: '10%' }}>{assignment.teacherLastName}, {assignment.teacherFirstName}</Text>
            <Text style={{ ...styles.tableCol, width: '10%' }}>{assignment.subjectName ?? ''}</Text>
            <Text style={{ ...styles.tableCol, width: '10%' }}>{assignment.learningContentName ?? ''}</Text>
            <Text style={{ ...styles.tableCol, width: '10%' }}>{assignment.roomName ?? ''}</Text>
            {Object.keys(turns).map((turn, turnIdx) => {
              const group = getGroupForTeacherAndTurn(teacherIdx, turnIdx, period);
              return (
                <Text key={turn} style={{ ...styles.tableCol, width: `${60 / Object.keys(turns).length}%` }}>
                  {group ? group.id : ''}
                </Text>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * @param {{
 *   groups: { id: number, students: { firstName: string, lastName: string }[] }[],
 *   maxStudents: number,
 *   turns: Record<string, unknown>,
 *   getTurnusInfo: (turnKey: string) => { start: string, end: string, days: number },
 *   getGroupForTeacherAndTurn: (teacherIdx: number, turnIdx: number, period: 'AM' | 'PM') => any,
 *   amAssignments: any[],
 *   pmAssignments: any[],
 *   className: string,
 * }} props
 */
const PDFLayout = ({
  groups = [],
  maxStudents = 0,
  turns = {},
  getTurnusInfo = () => ({ start: '', end: '', days: 0 }),
  getGroupForTeacherAndTurn = () => ({}),
  amAssignments = [],
  pmAssignments = [],
  className = ''
}) => (
  <Document>
    <Page size="A4" orientation="landscape" style={styles.page}>
      {/* Gruppenübersicht */}
      <View style={[styles.section]}>
        <Text style={styles.title}>Wechselplan {className}</Text>
        <View style={[styles.table, { width: '60%' }]}>
          <View style={[styles.tableRow]}>
            {groups.map((group) => (
              <Text key={group.id} style={{ ...styles.tableCol, ...styles.tableHeader, width: `${100/groups.length}%` }}>
                Gruppe {group.id}
              </Text>
            ))}
          </View>
          {[...Array(maxStudents)].map((_, rowIdx) => (
            <View style={[styles.tableRow]} key={rowIdx} >
              {groups.map((group) => (
                <Text key={group.id} style={{ ...styles.tableCol, width: `${100/groups.length}%` }}>
                  {group.students[rowIdx]
                    ? `${rowIdx + 1}. ${group.students[rowIdx].lastName} ${group.students[rowIdx].firstName}`
                    : ''}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </View>
      {/* AM Schedule Table */}
      {renderScheduleTable('AM', amAssignments, turns, getTurnusInfo, getGroupForTeacherAndTurn, groups, styles)}
      {/* PM Schedule Table */}
      {renderScheduleTable('PM', pmAssignments, turns, getTurnusInfo, getGroupForTeacherAndTurn, groups, styles)}
    </Page>
  </Document>
);

export default PDFLayout;
