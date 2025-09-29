// components/MyDocument.js
import { Document, Page, Text, StyleSheet, View } from '@react-pdf/renderer';

const GROUP_COLORS = [
  '#fef9c3', // yellow-200
  '#dcfce7', // green-200
  '#dbeafe', // blue-200
  '#fee2e2', // red-200
];

const styles = StyleSheet.create({
  page: {
    padding: 15,
    fontSize: 8,
    fontFamily: 'Helvetica',
  },
  section: {
    marginBottom: 8,
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
    padding: 3,
    flexGrow: 1,
    textAlign: 'center',
  },
  tableHeader: {
    fontWeight: 'bold',
    backgroundColor: '#f8f9fa',
    fontSize: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  studentName: {
    fontSize: 6,
    lineHeight: 1.2,
  },
  teacherName: {
    fontSize: 7,
    lineHeight: 1.3,
  },
  turnusHeader: {
    fontSize: 6,
    lineHeight: 1,
  },
  infoSection: {
    fontSize: 8,
    marginTop: 8,
  },
  groupContainer: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  groupTable: {
    width: '24%',
    marginRight: '1%',
  },
  scheduleContainer: {
    flexDirection: 'column',
    marginBottom: 6,
  },
  scheduleTable: {
    width: '100%',
    marginBottom: 6,
  },
  compactTurnusHeader: {
    fontSize: 6,
    lineHeight: 1.1,
    textAlign: 'center',
  },
});

/**
 * Renders a schedule table for the specified period, displaying teacher assignments and their group allocations for each turnus.
 *
 * The table includes columns for teacher, workshop, content, room, and one column per turnus period, with group cells color-coded according to group ID.
 *
 * @param {'AM'|'PM'} period - Indicates whether to render the morning ('AM') or afternoon ('PM') schedule.
 * @param {any[]} assignments - List of teacher assignment objects with subject and room details.
 * @param {Record<string, unknown>} turns - Object representing available turnus periods.
 * @param {(turnKey: string) => { start: string, end: string, days: number }} getTurnusInfo - Function to retrieve start and end dates for a turnus.
 * @param {(teacherIdx: number, turnIdx: number, period: 'AM'|'PM') => any} getGroupForTeacherAndTurn - Function to get the group assigned to a teacher for a specific turnus and period.
 * @param {{ id: number, students: { firstName: string, lastName: string }[] }[]} groups - Array of group objects with student information.
 * @param {any} styles - StyleSheet object for table styling.
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
          {Object.keys(turns).map((turn, turnIdx) => {
            const { start, end, days } = getTurnusInfo(turn);
            // The 'days' value from getTurnusInfo is actually the number of weeks, not days
            const weeks = days || 0;
            return (
              <Text key={turn} style={{ ...styles.tableCol, ...styles.tableHeader, ...styles.compactTurnusHeader, width: `${60 / Object.keys(turns).length}%` }}>
                T{turnIdx + 1}{'\n'}{start}-{end}{'\n'}({weeks}W)
              </Text>
            );
          })}
        </View>
        {assignments.map((assignment, teacherIdx) => (
          <View style={styles.tableRow} key={assignment.teacherId}>
            <Text style={{ ...styles.tableCol, ...styles.teacherName, width: '10%' }}>{assignment.teacherLastName}, {assignment.teacherFirstName}</Text>
            <Text style={{ ...styles.tableCol, width: '10%' }}>{assignment.subjectName ?? ''}</Text>
            <Text style={{ ...styles.tableCol, width: '10%' }}>{assignment.learningContentName ?? ''}</Text>
            <Text style={{ ...styles.tableCol, width: '10%' }}>{assignment.roomName ?? ''}</Text>
            {Object.keys(turns).map((turn, turnIdx) => {
              const group = getGroupForTeacherAndTurn(teacherIdx, turnIdx, period);
              return (
                <Text 
                  key={turn} 
                  style={{ 
                    ...styles.tableCol, 
                    width: `${60 / Object.keys(turns).length}%`,
                    backgroundColor: group ? GROUP_COLORS[(group.id - 1) % GROUP_COLORS.length] : undefined
                  }}
                >
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
 *   classHead: string,
 *   classLead: string,
 *   additionalInfo: string,
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
  className = '',
  classHead = '—',
  classLead = '—',
  additionalInfo = '—'
}) => {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <Text style={styles.title}>Wechselplan {className}</Text>
        
        {/* Student Groups - All groups in one row */}
        <View style={styles.section}>
          <View style={styles.groupContainer}>
            {groups.map((group) => (
              <View key={group.id} style={styles.groupTable}>
                <View style={styles.table}>
                  <View style={styles.tableRow}>
                    <Text 
                      style={{ 
                        ...styles.tableCol, 
                        ...styles.tableHeader,
                        backgroundColor: GROUP_COLORS[(group.id - 1) % GROUP_COLORS.length],
                        fontSize: 8
                      }}
                    >
                      Gruppe {group.id}
                    </Text>
                  </View>
                  {[...Array(12)].map((_, idx) => {
                    const student = group.students[idx];
                    return (
                      <View style={styles.tableRow} key={idx}>
                        <Text 
                          style={{ 
                            ...styles.tableCol, 
                            ...styles.studentName,
                            backgroundColor: GROUP_COLORS[(group.id - 1) % GROUP_COLORS.length]
                          }}
                        >
                          {student 
                            ? `${idx + 1}. ${student.lastName} ${student.firstName}`
                            : `${idx + 1}. -`
                          }
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Class Information */}
        <View style={styles.infoSection}>
          <Text>Klassenvorstand: {classHead}    Klassenleitung: {classLead}</Text>
          <Text>  </Text>
          <Text>
            <Text style={{ fontWeight: 'bold' }}>Zusätzliche Informationen:</Text>
            {'\n'}
            <Text style={{ marginTop: 2 }}>{additionalInfo}</Text>
          </Text>
        </View>

        {/* Schedule Tables - Side by side */}
        <View style={styles.scheduleContainer}>
          {/* AM Schedule Table */}
          <View style={styles.scheduleTable}>
            {renderScheduleTable('AM', amAssignments, turns, getTurnusInfo, getGroupForTeacherAndTurn, groups, styles)}
          </View>
          {/* PM Schedule Table */}
          <View style={styles.scheduleTable}>
            {renderScheduleTable('PM', pmAssignments, turns, getTurnusInfo, getGroupForTeacherAndTurn, groups, styles)}
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default PDFLayout;
