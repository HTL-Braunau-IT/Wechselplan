import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer} from '@react-pdf/renderer';


// Create styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30,
  },
  section: {
    margin: 10,
    padding: 10,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 10,
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
    marginBottom: 20,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableCol: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#bfbfbf',
    padding: 5,
  },
  tableCell: {
    fontSize: 10,
  },
  header: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
  },
});

interface PDFData {
  groups: Array<{
    id: number;
    students: Array<{
      firstName: string;
      lastName: string;
    }>;
  }>;
  amSchedule: Array<{
    teacher: {
      firstName: string;
      lastName: string;
    };
    subject: string;
    learningContent: string;
    room: string;
    groups: number[];
  }>;
  pmSchedule: Array<{
    teacher: {
      firstName: string;
      lastName: string;
    };
    subject: string;
    learningContent: string;
    room: string;
    groups: number[];
  }>;
}

const MyDocument = ({ data }: { data: PDFData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>Stundenplan Übersicht</Text>
      
      {/* Groups Section */}
      <View style={styles.section}>
        <Text style={styles.subtitle}>Gruppen</Text>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.header]}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Gruppe</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Schüler</Text>
            </View>
          </View>
          {data.groups.map((group) => (
            <View key={group.id} style={styles.tableRow}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Gruppe {group.id}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>
                  {group.students.map(s => `${s.lastName}, ${s.firstName}`).join('\n')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* AM Schedule */}
      <View style={styles.section}>
        <Text style={styles.subtitle}>Vormittag</Text>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.header]}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Lehrer</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Fach</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Inhalt</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Raum</Text>
            </View>
          </View>
          {data.amSchedule.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{item.teacher.lastName}, {item.teacher.firstName}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{item.subject}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{item.learningContent}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{item.room}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* PM Schedule */}
      <View style={styles.section}>
        <Text style={styles.subtitle}>Nachmittag</Text>
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.header]}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Lehrer</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Fach</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Inhalt</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Raum</Text>
            </View>
          </View>
          {data.pmSchedule.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{item.teacher.lastName}, {item.teacher.firstName}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{item.subject}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{item.learningContent}</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>{item.room}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </Page>
  </Document>
);


export async function generateSchedulePDF(data: PDFData): Promise<Buffer> {
    try {
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid data: data must be an object');
      }
  
      const buffer = await renderToBuffer(<MyDocument data={data} />);
  
      return buffer;
    } catch (error) {
      console.error('Error in generateSchedulePDF:', error);
      throw error instanceof Error ? error : new Error('Failed to generate PDF');
    }
  }