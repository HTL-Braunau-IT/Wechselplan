import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  getTurnusInfo, 
  getWeekdayName, 
  getWeekdayAbbr,
  getSchoolYear, 
  formatDateGerman 
} from './pdf-helpers';
import { parseScheduleWeekDate } from './schedule-data-helpers';
import { pmNachmittagJa, turnScheduleHasPmRhythm } from './pm-biweekly-track';
import type { TurnSchedule } from '@/types/schedule';
import { truncateSubject } from './subject-utils';

// Group colors matching the screenshot
const GROUP_COLORS = {
  1: '#fef9c3', // yellow
  2: '#dcfce7', // green
  3: '#ffedd5', // orange
  4: '#fee2e2', // red
};

interface PDFData {
  groups: Array<{
    id: number;
    students: Array<{
      firstName: string;
      lastName: string;
    }>;
  }>;
  amAssignments: Array<{
    teacherFirstName: string;
    teacherLastName: string;
    subjectName: string;
    learningContentName: string;
    roomName: string;
    groupId: number;
  }>;
  pmAssignments: Array<{
    teacherFirstName: string;
    teacherLastName: string;
    subjectName: string;
    learningContentName: string;
    roomName: string;
    groupId: number;
    pmTrack?: 'ALL' | 'A' | 'B';
  }>;
  turns: Record<string, unknown>;
  className: string;
  classHead: string;
  classLead: string;
  additionalInfo: string;
  selectedWeekday: number;
  scheduleTimes: Array<{
    startTime: string;
    endTime: string;
    period?: string;
    hours?: number;
  }>;
  breakTimes: Array<{
    name?: string;
    startTime: string;
    endTime: string;
    period: string;
  }>;
  updatedAt: Date;
}

/**
 * Returns the group assigned to a teacher for a specific turn and period.
 * Rotates the group list by the turn index.
 */
function getGroupForTeacherAndTurn(
  groups: PDFData['groups'],
  teacherIdx: number,
  turnIdx: number,
  period: 'AM' | 'PM',
  assignments: PDFData['amAssignments'] | PDFData['pmAssignments']
) {
  if (!groups.length || !assignments[teacherIdx]) return null;
  
  // For each turn, rotate the group list
  const rotatedGroups = [...groups];
  for (let i = 0; i < turnIdx; i++) {
    const temp = rotatedGroups.shift();
    if (temp !== undefined) rotatedGroups.push(temp);
  }
  
  return rotatedGroups[teacherIdx] ?? null;
}

/**
 * Gets time range for a period from schedule times
 */
function getPeriodTimeRange(
  scheduleTimes: PDFData['scheduleTimes'],
  period: 'AM' | 'PM'
): string {
  const periodTimes = scheduleTimes.filter(t => t.period === period);
  if (!periodTimes.length) return '';
  
  const first = periodTimes[0];
  const last = periodTimes[periodTimes.length - 1];
  if (!first || !last) return '';
  return `${first.startTime} - ${last.endTime}`;
}

/**
 * Gets break time for a period
 */
function getBreakTime(
  breakTimes: PDFData['breakTimes'],
  period: 'AM' | 'PM' | 'LUNCH'
): string {
  const breakTime = breakTimes.find(bt => bt.period === period);
  if (!breakTime) return '';
  return `${breakTime.startTime}-${breakTime.endTime}`;
}

/**
 * Generates a schedule PDF matching the screenshot format
 */
export async function generateSchedulePDF(data: PDFData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10; // Reduced margin for more space
  let yPos = margin;

  // Colors
  const textColor: [number, number, number] = [0, 0, 0];
  const borderColor: [number, number, number] = [0, 0, 0];
  const yellowBar: [number, number, number] = [254, 249, 195]; // #fef9c3

  // Header Section - more compact
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const schoolYear = getSchoolYear();
  doc.text(`WECHSELPLAN ${schoolYear}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 6;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(data.className, pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;

  const updatedDate = formatDateGerman(data.updatedAt);
  const updatedWeekdayName = getWeekdayName(data.updatedAt.getDay());
  doc.setFontSize(7);
  doc.text(`Letzte Aktualisierung: ${updatedWeekdayName}, ${updatedDate}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 6;

  // Two-column layout: Info on left, Student Groups on right
  const leftColumnWidth = 85; // Width for info section
  const rightColumnStart = margin + leftColumnWidth + 5; // Start position for student groups
  const rightColumnWidth = pageWidth - rightColumnStart - margin; // Remaining width for student groups
  const sectionStartY = yPos;

  // General Information Section - LEFT COLUMN
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Allgemeine Informationen', margin, yPos);
  yPos += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const infoItems = [
    `Klasse: ${data.className}`,
    `Klassenleiter: ${data.classLead}`,
    `Klassenvorstand: ${data.classHead}`,
    'Wechselklasse:'
  ];
  
  infoItems.forEach((item) => {
    // Draw box around each item
    const boxHeight = 4;
    const boxWidth = leftColumnWidth;
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(250, 250, 250);
    doc.rect(margin, yPos - 3, boxWidth, boxHeight, 'FD');
    doc.text(item, margin + 2, yPos);
    yPos += boxHeight + 1;
  });

  // Student Groups Table - RIGHT COLUMN (starting at same Y as info section)
  const groupTableData: string[][] = [];
  const maxStudents = Math.max(...data.groups.map(g => g.students.length), 0);
  
  // Header row
  const headerRow: string[] = [];
  data.groups.forEach(group => {
    headerRow.push(`Gruppe ${group.id}`);
  });
  // Fill empty columns if less than 4 groups
  while (headerRow.length < 4) {
    headerRow.push('');
  }
  groupTableData.push(headerRow);

  // Student rows - limit to 12 rows max
  for (let i = 0; i < Math.min(Math.max(maxStudents, 12), 12); i++) {
    const row: string[] = [];
    data.groups.forEach(group => {
      const student = group.students[i];
      if (student) {
        row.push(`${i + 1}. ${student.lastName} ${student.firstName}`);
      } else {
        row.push(`${i + 1}. -`);
      }
    });
    // Fill empty columns
    while (row.length < 4) {
      row.push('');
    }
    groupTableData.push(row);
  }

  autoTable(doc, {
    startY: sectionStartY,
    head: groupTableData[0] ? [groupTableData[0]] : [],
    body: groupTableData.slice(1),
    theme: 'grid',
    headStyles: {
      textColor: textColor,
      fontStyle: 'bold',
      fontSize: 6,
    },
    bodyStyles: {
      fontSize: 5,
      textColor: textColor,
    },
    columnStyles: {
      0: { cellWidth: rightColumnWidth / 4 },
      1: { cellWidth: rightColumnWidth / 4 },
      2: { cellWidth: rightColumnWidth / 4 },
      3: { cellWidth: rightColumnWidth / 4 },
    },
    styles: {
      cellPadding: 1,
      lineWidth: 0.3,
      lineColor: borderColor,
      minCellHeight: 3,
    },
    margin: { left: rightColumnStart, right: margin },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      // Apply colors to headers and body cells based on column
      const groupNum = data.column.index + 1;
      if (groupNum >= 1 && groupNum <= 4) {
        const color = GROUP_COLORS[groupNum as keyof typeof GROUP_COLORS];
        if (color) {
          data.cell.styles.fillColor = hexToRgb(color);
        }
      }
    },
  });

  // Set yPos to the bottom of whichever section is taller
  const infoSectionEnd = yPos;
  const tableEnd = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  yPos = Math.max(infoSectionEnd, tableEnd) + 4;

  // Schedule Sections - Simple format
  const weekdayName = getWeekdayName(data.selectedWeekday);
  const turnKeysSorted = Object.keys(data.turns).sort();
  const maxTurnus = Math.min(turnKeysSorted.length, 8); // Support up to 8 turnus

  // Helper function to parse date string and find Monday of that week
  const getMondayOfWeek = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('.');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2] ?? '', 10);
        if (year && year < 100) {
          year = year < 50 ? 2000 + year : 1900 + year;
        } else if (!year) {
          year = new Date().getFullYear();
        }
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
          const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days
          const monday = new Date(date);
          monday.setDate(date.getDate() + daysToMonday);
          const weekdayAbbr = getWeekdayAbbr(1); // Monday
          return `${weekdayAbbr} - ${String(monday.getDate()).padStart(2, '0')}.${String(monday.getMonth() + 1).padStart(2, '0')}`;
        }
      }
    } catch {
      // Ignore errors
    }
    return '';
  };

  // Helper function to parse date string and find Sunday of that week
  const getSundayOfWeek = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('.');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2] ?? '', 10);
        if (year && year < 100) {
          year = year < 50 ? 2000 + year : 1900 + year;
        } else if (!year) {
          year = new Date().getFullYear();
        }
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
          const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek; // If not Sunday, go forward
          const sunday = new Date(date);
          sunday.setDate(date.getDate() + daysToSunday);
          const weekdayAbbr = getWeekdayAbbr(0); // Sunday
          return `${weekdayAbbr} - ${String(sunday.getDate()).padStart(2, '0')}.${String(sunday.getMonth() + 1).padStart(2, '0')}`;
        }
      }
    } catch {
      // Ignore errors
    }
    return '';
  };

  // Get turnus date ranges for header (FIRSTDATE - LASTDATE format)
  const turnusDates: string[] = [];
  const turnusBeginDates: string[] = [];
  const turnusEndDates: string[] = [];
  const turnusKW: string[] = [];
  
  turnKeysSorted.slice(0, maxTurnus).forEach((turnKey) => {
    const turnInfo = getTurnusInfo(turnKey, data.turns);
    
    // Extract just the date part (DD.MM) from start and end dates
    const formatDateOnly = (dateStr: string): string => {
      if (!dateStr) return '';
      const parts = dateStr.split('.');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return `${parts[0].padStart(2, '0')}.${parts[1].padStart(2, '0')}`;
      }
      return dateStr;
    };
    
    const startDate = formatDateOnly((turnInfo.start || turnInfo.startFormatted || '') as string);
    
    // Only use start date for Turnusbeginn row
    if (startDate) {
      turnusDates.push(startDate);
    } else {
      turnusDates.push('');
    }
    
    // Get Monday of first week and Sunday of last week
    turnusBeginDates.push(getMondayOfWeek(turnInfo.start || turnInfo.startFormatted || ''));
    turnusEndDates.push(getSundayOfWeek(turnInfo.end || turnInfo.endFormatted || ''));
    
    // Get calendar week range
    if (turnInfo.startKW && turnInfo.endKW) {
      turnusKW.push(`KW ${turnInfo.startKW}-${turnInfo.endKW}`);
    } else if (turnInfo.startKW) {
      turnusKW.push(`KW ${turnInfo.startKW}`);
    } else if (turnInfo.endKW) {
      turnusKW.push(`KW ${turnInfo.endKW}`);
    } else {
      turnusKW.push('');
    }
  });

  // Vormittag (AM) Section - only render if there are AM assignments
  if (data.amAssignments.length > 0) {
  const amTimeRange = getPeriodTimeRange(data.scheduleTimes, 'AM');

  // Build AM table data
  const amTableData: string[][] = [];
  data.amAssignments.forEach((assignment, teacherIdx) => {
    const row: string[] = [
      `${assignment.teacherLastName} ${assignment.teacherFirstName}`,
      assignment.subjectName || '',
      assignment.learningContentName || '',
      assignment.roomName || '',
      '----------', // Turnusbeginn column
    ];
    
    // Add group numbers for each turnus
    for (let turnIdx = 0; turnIdx < maxTurnus; turnIdx++) {
      const turnKey = turnKeysSorted[turnIdx];
      if (turnKey) {
        const group = getGroupForTeacherAndTurn(data.groups, teacherIdx, turnIdx, 'AM', data.amAssignments);
        row.push(group ? group.id.toString() : '');
      } else {
        row.push('');
      }
    }

    amTableData.push(row);
  });

  // Add footer row with week counts for each turnus
  const amWeeksRow: string[] = ['', '', '', '', 'U.-Wochen'];
  turnKeysSorted.slice(0, maxTurnus).forEach((turnKey) => {
    const turnInfo = getTurnusInfo(turnKey, data.turns);
    // days property represents the number of weeks (from weeks.length)
    const weeks = turnInfo.days || 0;
    amWeeksRow.push(weeks > 0 ? `${weeks} UW` : '');
  });
  // Fill empty columns if less than maxTurnus
  while (amWeeksRow.length < 5 + maxTurnus) {
    amWeeksRow.push('');
  }
  amTableData.push(amWeeksRow);

  // Two-level header for AM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const amTopHeaderRow: any[] = [];
  amTopHeaderRow.push({ content: `${weekdayName} Vormittag: ${amTimeRange}`, colSpan: 5 });
  for (let idx = 0; idx < maxTurnus; idx++) {
    amTopHeaderRow.push(`Turnus ${idx + 1}`);
  }

  // Empty rows between top and second header - filled with turnus data
  const amEmptyHeaderRow1: string[] = ['', '', '', '', 'Beginn', ...turnusBeginDates];
  const amEmptyHeaderRow2: string[] = ['', '', '', '', 'Ende', ...turnusEndDates];
  const amEmptyHeaderRow3: string[] = ['', '', '', '', 'KW', ...turnusKW];

  const amSecondHeaderRow = [
    'Lehrer/in',
    'Werkstätte',
    'Lehrinhalt',
    'Raum',
    'Turnusbeginn',
    ...turnusDates
  ];

  autoTable(doc, {
    startY: yPos,
    head: [amTopHeaderRow, amEmptyHeaderRow1, amEmptyHeaderRow2, amEmptyHeaderRow3, amSecondHeaderRow],
    body: amTableData,
    theme: 'grid',
    showHead: 'firstPage',
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: textColor,
      fontStyle: 'bold',
      fontSize: 7,
    },
    bodyStyles: {
      fontSize: 6,
      textColor: textColor,
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 40 },
      2: { cellWidth: 35 },
      3: { cellWidth: 20 },
      4: { cellWidth: 25 },
    },
    styles: {
      cellPadding: 1.5,
      lineWidth: 0.3,
      lineColor: borderColor,
    },
    margin: { left: margin, right: margin },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      // Make empty header rows (row indices 1, 2, 3) white and smaller, but only for cells with content
      if (data.section === 'head' && (data.row.index === 1 || data.row.index === 2 || data.row.index === 3)) {
        // Only style cells that have content (skip empty cells in first 4 columns)
        if (data.cell.text?.[0]?.trim() !== '') {
          data.cell.styles.fillColor = [255, 255, 255];
          data.cell.styles.minCellHeight = 3; // Reduce row height
          data.cell.styles.fontSize = 5; // Smaller font
          data.cell.styles.cellPadding = 0.5; // Less padding
          // Make KW row (row index 3) text blue
          if (data.row.index === 3 && data.column.index >= 5) {
            data.cell.styles.textColor = [0, 0, 255];
          }
        } else {
          // Keep left border - just set white background for empty cells
          data.cell.styles.fillColor = [255, 255, 255];
          // Borders will remain (including left border) with default styling
        }
      }
      // Make Turnusbeginn row (row index 4) date text red
      if (data.section === 'head' && data.row.index === 4 && data.column.index >= 5) {
        data.cell.styles.textColor = [255, 0, 0];
      }
      // Only color body rows, not header rows, and skip U.-Wochen row
      if (data.section === 'body' && data.column.index >= 5 && data.cell.text?.[0]) {
        // Check if this is the U.-Wochen row (has "U.-Wochen" in column 4)
        const isWeeksRow = data.row.cells?.[4]?.text?.[0] === 'U.-Wochen';
        if (!isWeeksRow) {
          const groupNum = parseInt(String(data.cell.text?.[0] ?? '0'), 10);
          if (groupNum >= 1 && groupNum <= 4) {
            const color = GROUP_COLORS[groupNum as keyof typeof GROUP_COLORS];
            if (color) {
              data.cell.styles.fillColor = hexToRgb(color);
            }
          }
        }
      }
    },
  });

  yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  // Nachmittag (PM) Section - only render if there are PM assignments
  if (data.pmAssignments.length > 0) {
  const pmTimeRange = getPeriodTimeRange(data.scheduleTimes, 'PM');

  // Build PM table data
  const pmTableData: string[][] = [];
  data.pmAssignments.forEach((assignment, teacherIdx) => {
    const row: string[] = [
      `${assignment.teacherLastName} ${assignment.teacherFirstName}`,
      assignment.subjectName || '',
      assignment.learningContentName || '',
      assignment.roomName || '',
      '----------', // Turnusbeginn column
    ];
    
    // Add group numbers for each turnus
    for (let turnIdx = 0; turnIdx < maxTurnus; turnIdx++) {
      const turnKey = turnKeysSorted[turnIdx];
      if (turnKey) {
        const group = getGroupForTeacherAndTurn(data.groups, teacherIdx, turnIdx, 'PM', data.pmAssignments);
        row.push(group ? group.id.toString() : '');
      } else {
        row.push('');
      }
    }

    pmTableData.push(row);
  });

  // Add footer row with week counts for each turnus
  const pmWeeksRow: string[] = ['', '', '', '', 'U.-Wochen'];
  turnKeysSorted.slice(0, maxTurnus).forEach((turnKey) => {
    const turnInfo = getTurnusInfo(turnKey, data.turns);
    // days property represents the number of weeks (from weeks.length)
    const weeks = turnInfo.days || 0;
    pmWeeksRow.push(weeks > 0 ? `${weeks} UW` : '');
  });
  // Fill empty columns if less than maxTurnus
  while (pmWeeksRow.length < 5 + maxTurnus) {
    pmWeeksRow.push('');
  }
  pmTableData.push(pmWeeksRow);

  // Two-level header for PM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pmTopHeaderRow: any[] = [];
  pmTopHeaderRow.push({ content: `${weekdayName} Nachmittag: ${pmTimeRange}`, colSpan: 5 });
  for (let idx = 0; idx < maxTurnus; idx++) {
    pmTopHeaderRow.push(`Turnus ${idx + 1}`);
  }

  // Empty rows between top and second header - filled with turnus data
  const pmEmptyHeaderRow1: string[] = ['', '', '', '', 'Beginn', ...turnusBeginDates];
  const pmEmptyHeaderRow2: string[] = ['', '', '', '', 'Ende', ...turnusEndDates];
  const pmEmptyHeaderRow3: string[] = ['', '', '', '', 'KW', ...turnusKW];

  const pmSecondHeaderRow = [
    'Lehrer/in',
    'Werkstätte',
    'Lehrinhalt',
    'Raum',
    'Turnusbeginn',
    ...turnusDates
  ];

  autoTable(doc, {
    startY: yPos,
    head: [pmTopHeaderRow, pmEmptyHeaderRow1, pmEmptyHeaderRow2, pmEmptyHeaderRow3, pmSecondHeaderRow],
    body: pmTableData,
    theme: 'grid',
    showHead: 'firstPage',
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: textColor,
      fontStyle: 'bold',
      fontSize: 7,
    },
    bodyStyles: {
      fontSize: 6,
      textColor: textColor,
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 40 },
      2: { cellWidth: 35 },
      3: { cellWidth: 20 },
      4: { cellWidth: 25 },
    },
    styles: {
      cellPadding: 1.5,
      lineWidth: 0.3,
      lineColor: borderColor,
    },
    margin: { left: margin, right: margin },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      // Make empty header rows (row indices 1, 2, 3) white and smaller, but only for cells with content
      if (data.section === 'head' && (data.row.index === 1 || data.row.index === 2 || data.row.index === 3)) {
        // Only style cells that have content (skip empty cells in first 4 columns)
        if (data.cell.text?.[0]?.trim() !== '') {
          data.cell.styles.fillColor = [255, 255, 255];
          data.cell.styles.minCellHeight = 3; // Reduce row height
          data.cell.styles.fontSize = 5; // Smaller font
          data.cell.styles.cellPadding = 0.5; // Less padding
          // Make KW row (row index 3) text blue
          if (data.row.index === 3 && data.column.index >= 5) {
            data.cell.styles.textColor = [0, 0, 255];
          }
        } else {
          // Keep left border - just set white background for empty cells
          data.cell.styles.fillColor = [255, 255, 255];
          // Borders will remain (including left border) with default styling
        }
      }
      // Make Turnusbeginn row (row index 4) date text red
      if (data.section === 'head' && data.row.index === 4 && data.column.index >= 5) {
        data.cell.styles.textColor = [255, 0, 0];
      }
      // Only color body rows, not header rows, and skip U.-Wochen row
      if (data.section === 'body' && data.column.index >= 5 && data.cell.text?.[0]) {
        // Check if this is the U.-Wochen row (has "U.-Wochen" in column 4)
        const isWeeksRow = data.row.cells?.[4]?.text?.[0] === 'U.-Wochen';
        if (!isWeeksRow) {
          const groupNum = parseInt(String(data.cell.text?.[0] ?? '0'), 10);
          if (groupNum >= 1 && groupNum <= 4) {
            const color = GROUP_COLORS[groupNum as keyof typeof GROUP_COLORS];
            if (color) {
              data.cell.styles.fillColor = hexToRgb(color);
            }
          }
        }
      }
    },
  });

  yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }

  // Nachmittag: Woche für Woche (Ja/Nein) — nur bei aktivem Zwei-Wochen-Rhythmus
  if (data.pmAssignments.length > 0 && turnScheduleHasPmRhythm(data.turns as TurnSchedule)) {
    type WeekCol = {
      turnIdx: number
      date: string
      weekLbl: string
      included: boolean
      spur: 'A' | 'B' | null
    }
    const sortedTurnKeys = Object.keys(data.turns).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const weekCols: WeekCol[] = []
    for (let ti = 0; ti < sortedTurnKeys.length; ti++) {
      const name = sortedTurnKeys[ti]
      if (!name) continue
      const term = data.turns[name] as {
        weeks?: Array<{ date: string; week?: string; includedInPlan?: boolean; pmTrack?: 'A' | 'B' | null }>
      }
      for (const w of term.weeks ?? []) {
        weekCols.push({
          turnIdx: ti,
          date: w.date,
          weekLbl: w.week ?? '',
          included: w.includedInPlan !== false,
          spur: w.pmTrack ?? null
        })
      }
    }
    weekCols.sort((a, b) => {
      const da = parseScheduleWeekDate(a.date).getTime()
      const db = parseScheduleWeekDate(b.date).getTime()
      if (da !== db) return da - db
      return a.turnIdx - b.turnIdx
    })
    if (weekCols.length > 0) {
      if (yPos > pageHeight - 40) {
        doc.addPage()
        yPos = margin
      }
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text('Nachmittag: Woche für Woche', margin, yPos)
      yPos += 3
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5)
      doc.text('Ja = Nachmittagsunterricht, Nein = kein NM (Gruppe unverändert).', margin, yPos)
      yPos += 3

      const headerRow: string[] = ['Lehrer/in']
      for (const c of weekCols) {
        const short = c.date.length >= 5 ? c.date.slice(0, 5) : c.date
        headerRow.push(c.weekLbl ? `${short}\n${c.weekLbl}` : short)
      }
      const bodyRows: string[][] = []
      data.pmAssignments.forEach((assignment) => {
        const row: string[] = [`${assignment.teacherLastName} ${assignment.teacherFirstName}`]
        const track = assignment.pmTrack ?? 'ALL'
        for (const col of weekCols) {
          const ja = pmNachmittagJa(track, {
            includedInPlan: col.included,
            pmTrack: col.spur
          })
          row.push(ja ? 'Nachmittag: Ja' : 'Nachmittag: Nein')
        }
        bodyRows.push(row)
      })

      const teacherColMm = 32
      const weekColMm = Math.max(8, (pageWidth - 2 * margin - teacherColMm) / weekCols.length)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const colStyles: Record<number, any> = { 0: { cellWidth: teacherColMm } }
      for (let ci = 1; ci <= weekCols.length; ci++) {
        colStyles[ci] = { cellWidth: weekColMm }
      }

      autoTable(doc, {
        startY: yPos,
        head: [headerRow],
        body: bodyRows,
        theme: 'grid',
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: textColor,
          fontStyle: 'bold',
          fontSize: 5
        },
        bodyStyles: {
          fontSize: 4,
          textColor: textColor
        },
        columnStyles: colStyles,
        styles: {
          cellPadding: 0.35,
          lineWidth: 0.2,
          lineColor: borderColor,
          minCellHeight: 4,
          fontSize: 4
        },
        margin: { left: margin, right: margin },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (cellData: any) => {
          if (cellData.section === 'body' && cellData.column.index >= 1) {
            const t = String(cellData.cell.text?.[0] ?? '')
            if (t.includes('Ja')) {
              cellData.cell.styles.fillColor = [220, 252, 231]
            } else if (t.includes('Nein')) {
              cellData.cell.styles.fillColor = [245, 245, 245]
            }
          }
        }
      })

      yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2
      const footParts = data.pmAssignments
        .filter((a) => a.pmTrack === 'A' || a.pmTrack === 'B')
        .map((a) => `${a.teacherLastName}: nur Spur ${a.pmTrack}`)
      if (footParts.length > 0) {
        doc.setFontSize(5)
        doc.setFont('helvetica', 'italic')
        const foot = `NM nur in „Ja“-Wochen: ${footParts.join(' · ')}`
        const lines = doc.splitTextToSize(foot, pageWidth - 2 * margin)
        doc.text(lines as string | string[], margin, yPos)
        yPos += lines.length * 2.2 + 1
      }
    }
  }

  // Break Times Section - in one row with single outline, INFO on the right
  const amBreak = getBreakTime(data.breakTimes, 'AM');
  const lunchBreak = getBreakTime(data.breakTimes, 'LUNCH');
  const pmBreak = getBreakTime(data.breakTimes, 'PM');
  
  const breakTimesText: string[] = [];
  if (amBreak) breakTimesText.push(`Vormittag ${amBreak}`);
  if (lunchBreak) breakTimesText.push(`Mittag ${lunchBreak}`);
  if (pmBreak) breakTimesText.push(`Nachmittag ${pmBreak}`);
  
  const fullText = `Pausenzeiten für ${weekdayName}: ${breakTimesText.join(' ')}`;
  
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  const textWidth = doc.getTextWidth(fullText);
  const boxHeight = 5;
  const boxWidth = textWidth + 4;
  const spacing = 5; // Space between break times and INFO
  
  // Draw rectangle outline for break times
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.3);
  doc.rect(margin, yPos, boxWidth, boxHeight);
  
  // Draw text inside
  doc.text(fullText, margin + 2, yPos + 3.5);
  
  // INFO Note - with yellow background box, placed on the right
  if (data.additionalInfo && data.additionalInfo !== '—') {
    const infoBoxStartX = margin + boxWidth + spacing;
    const infoBoxWidth = pageWidth - infoBoxStartX - margin;
    const infoBoxHeight = boxHeight; // Same height as break times box
    
    doc.setFillColor(yellowBar[0], yellowBar[1], yellowBar[2]);
    doc.rect(infoBoxStartX, yPos, infoBoxWidth, infoBoxHeight, 'F');
    
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text('INFO:', infoBoxStartX + 2, yPos + 3.5);
    doc.setFont('helvetica', 'normal');
    
    // Split long text into multiple lines if needed
    const splitText = doc.splitTextToSize(data.additionalInfo, infoBoxWidth - 15);
    doc.text(splitText as string | string[], infoBoxStartX + 12, yPos + 3.5);
  }
  
  yPos += boxHeight + 2;

  // Footer - compact
  const footerY = pageHeight - 5;
  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  doc.text(`erstellt am: ${formatDateGerman(data.updatedAt)}`, pageWidth - margin, footerY, { align: 'right' });

  // Return PDF as buffer
  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * Converts hex color to RGB array
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1] ?? 'ff', 16),
        parseInt(result[2] ?? 'ff', 16),
        parseInt(result[3] ?? 'ff', 16),
      ]
    : [255, 255, 255];
}

interface NotensammlerPDFData {
  className: string;
  subjectName?: string;
  students: Array<{
    id: number;
    firstName: string;
    lastName: string;
    groupId: number | null;
  }>;
  amTeachers: Array<{
    id: number;
    firstName: string;
    lastName: string;
  }>;
  pmTeachers: Array<{
    id: number;
    firstName: string;
    lastName: string;
  }>;
  grades: Record<number, Record<number, {
    first: number | null;
    second: number | null;
  }>>;
  finalGrades?: Record<number, {
    first: number | null;
    second: number | null;
    conductWishFirst?: string | null;
    conductWishSecond?: string | null;
  }>;
}

/**
 * Generates a PDF for the notensammler (grade collector) data
 */
export async function generateNotensammlerPDF(data: NotensammlerPDFData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  let yPos = margin;

  // Colors
  const textColor: [number, number, number] = [0, 0, 0];
  const borderColor: [number, number, number] = [0, 0, 0];
  const headerColor: [number, number, number] = [240, 240, 240];
  const averageColor: [number, number, number] = [230, 230, 230];

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Notensammler', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  // Display class name with subject if available
  const classDisplayText = data.subjectName 
    ? `${data.className} - ${truncateSubject(data.subjectName)}`
    : data.className;
  doc.text(classDisplayText, pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  // Sort students by last name, then first name
  const sortedStudents = [...data.students]
    .filter(student => student.groupId !== null && student.groupId !== undefined)
    .sort((a, b) => {
      const lastNameCompare = a.lastName.localeCompare(b.lastName);
      if (lastNameCompare !== 0) return lastNameCompare;
      return a.firstName.localeCompare(b.firstName);
    });

  // Special grade values
  const NICHT_BEURTEILT = 6;
  const GESTUNDEN = 7;

  // Helper function to check if a grade should be included in average calculations
  const isGradeIncludedInAverage = (grade: number | null): boolean => {
    if (grade === null) return false;
    // Exclude special values 6 and 7 from averages
    if (grade === NICHT_BEURTEILT || grade === GESTUNDEN) return false;
    // Include only regular grades 1-5 (and their .5 increments)
    return grade >= 1 && grade <= 5;
  };

  // Helper function to get display text for a grade
  const getGradeDisplayText = (grade: number | null): string => {
    if (grade === null) return '';
    if (grade === NICHT_BEURTEILT) return 'nicht beurteilt';
    if (grade === GESTUNDEN) return 'gestunden';
    return grade.toString();
  };

  // Calculate averages for each student
  // Returns: number (average), "nicht beurteilt", "gestunden", or null
  const calculateAverage = (studentId: number, semester: 'first' | 'second'): number | string | null => {
    const studentGrades = data.grades[studentId];
    if (!studentGrades) return null;

    // First check if any grade is "nicht beurteilt" (6) or "gestunden" (7)
    for (const teacherId in studentGrades) {
      const teacherGrades = studentGrades[parseInt(teacherId)];
      if (teacherGrades) {
        const grade = teacherGrades[semester];
        if (grade === NICHT_BEURTEILT) {
          return 'nicht beurteilt';
        }
        if (grade === GESTUNDEN) {
          return 'gestunden';
        }
      }
    }

    // If no special grades, calculate normal average
    const gradeValues: number[] = [];
    for (const teacherId in studentGrades) {
      const teacherGrades = studentGrades[parseInt(teacherId)];
      if (teacherGrades) {
        const grade = teacherGrades[semester];
        // Only include grades that should be counted in averages (exclude 6 and 7)
        if (grade !== null && grade !== undefined && isGradeIncludedInAverage(grade)) {
          gradeValues.push(grade);
        }
      }
    }

    if (gradeValues.length === 0) return null;
    const sum = gradeValues.reduce((acc, val) => acc + val, 0);
    return Math.round((sum / gradeValues.length) * 10) / 10;
  };

  // Get grade value
  const getGrade = (studentId: number, teacherId: number, semester: 'first' | 'second'): number | null => {
    return data.grades[studentId]?.[teacherId]?.[semester] ?? null;
  };

  // Display value for final grade (Endnote): saved or pre-populated from average (nicht beurteilt/gestunden)
  const getFinalGradeDisplayText = (studentId: number, semester: 'first' | 'second'): string => {
    const saved = data.finalGrades?.[studentId]?.[semester];
    if (saved != null) return getGradeDisplayText(saved);
    const avg = calculateAverage(studentId, semester);
    if (avg === 'nicht beurteilt') return 'nicht beurteilt';
    if (avg === 'gestunden') return 'gestunden';
    return '-';
  };

  // Display value for Betragensnote (Wunsch)
  const getConductWishDisplayText = (studentId: number, semester: 'first' | 'second'): string => {
    const entry = data.finalGrades?.[studentId];
    if (!entry) return '-';
    const wish = semester === 'first' ? entry.conductWishFirst : entry.conductWishSecond;
    return wish ?? '-';
  };

  // Build table data
  const tableData: string[][] = [];

  // Build header row
  const headerRow: string[] = ['ID', 'Gruppe', 'Schüler'];
  
  // First semester headers
  data.amTeachers.forEach(teacher => {
    headerRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  data.pmTeachers.forEach(teacher => {
    headerRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  headerRow.push('Ø 1. Sem.'); // First semester average
  headerRow.push('Endnote'); // First semester Endnote
  headerRow.push('Betragensnote (Wunsch)'); // First semester

  // Second semester headers
  data.amTeachers.forEach(teacher => {
    headerRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  data.pmTeachers.forEach(teacher => {
    headerRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  headerRow.push('Ø 2. Sem.'); // Second semester average
  headerRow.push('Endnote'); // Second semester Endnote
  headerRow.push('Betragensnote (Wunsch)'); // Second semester

  // Build data rows
  sortedStudents.forEach((student, index) => {
    const row: string[] = [
      (index + 1).toString(),
      student.groupId?.toString() ?? '-',
      `${student.lastName}, ${student.firstName}`
    ];

    // First semester grades
    data.amTeachers.forEach(teacher => {
      const grade = getGrade(student.id, teacher.id, 'first');
      row.push(getGradeDisplayText(grade));
    });
    data.pmTeachers.forEach(teacher => {
      const grade = getGrade(student.id, teacher.id, 'first');
      row.push(getGradeDisplayText(grade));
    });
    
    // First semester average
    const firstAvg = calculateAverage(student.id, 'first');
    row.push(firstAvg === null ? '-' : typeof firstAvg === 'string' ? firstAvg : firstAvg.toFixed(1));
    // First semester Endnote
    row.push(getFinalGradeDisplayText(student.id, 'first'));
    // First semester Betragensnote (Wunsch)
    row.push(getConductWishDisplayText(student.id, 'first'));

    // Second semester grades
    data.amTeachers.forEach(teacher => {
      const grade = getGrade(student.id, teacher.id, 'second');
      row.push(getGradeDisplayText(grade));
    });
    data.pmTeachers.forEach(teacher => {
      const grade = getGrade(student.id, teacher.id, 'second');
      row.push(getGradeDisplayText(grade));
    });
    
    // Second semester average
    const secondAvg = calculateAverage(student.id, 'second');
    row.push(secondAvg === null ? '-' : typeof secondAvg === 'string' ? secondAvg : secondAvg.toFixed(1));
    // Second semester Endnote
    row.push(getFinalGradeDisplayText(student.id, 'second'));
    // Second semester Betragensnote (Wunsch)
    row.push(getConductWishDisplayText(student.id, 'second'));

    tableData.push(row);
  });

  // Calculate column widths (2 average + 2 endnote + 2 conduct wish columns)
  const totalTeachers = data.amTeachers.length + data.pmTeachers.length;
  const availableWidth = pageWidth - (margin * 2);
  const fixedColumnWidth = 15; // For ID, Gruppe columns
  const studentColumnWidth = 50; // For student name
  const averageColumnWidth = 12; // For average and endnote columns
  const conductWishColumnWidth = 22; // For Betragensnote (Wunsch) text
  const teacherColumnWidth = (availableWidth - (fixedColumnWidth * 2) - studentColumnWidth - (averageColumnWidth * 4) - (conductWishColumnWidth * 2)) / (totalTeachers * 2);

  const columnStyles: Record<number, { cellWidth: number }> = {
    0: { cellWidth: fixedColumnWidth }, // ID
    1: { cellWidth: fixedColumnWidth }, // Gruppe
    2: { cellWidth: studentColumnWidth }, // Schüler
  };

  // First semester teacher columns
  let colIndex = 3;
  data.amTeachers.forEach(() => {
    columnStyles[colIndex] = { cellWidth: teacherColumnWidth };
    colIndex++;
  });
  data.pmTeachers.forEach(() => {
    columnStyles[colIndex] = { cellWidth: teacherColumnWidth };
    colIndex++;
  });
  // First semester average
  columnStyles[colIndex] = { cellWidth: averageColumnWidth };
  colIndex++;
  // First semester Endnote
  columnStyles[colIndex] = { cellWidth: averageColumnWidth };
  colIndex++;
  // First semester Betragensnote (Wunsch)
  columnStyles[colIndex] = { cellWidth: conductWishColumnWidth };
  colIndex++;

  // Second semester teacher columns
  data.amTeachers.forEach(() => {
    columnStyles[colIndex] = { cellWidth: teacherColumnWidth };
    colIndex++;
  });
  data.pmTeachers.forEach(() => {
    columnStyles[colIndex] = { cellWidth: teacherColumnWidth };
    colIndex++;
  });
  // Second semester average
  columnStyles[colIndex] = { cellWidth: averageColumnWidth };
  colIndex++;
  // Second semester Endnote
  columnStyles[colIndex] = { cellWidth: averageColumnWidth };
  colIndex++;
  // Second semester Betragensnote (Wunsch)
  columnStyles[colIndex] = { cellWidth: conductWishColumnWidth };

  // Simplified header - use single row with section labels
  const simpleHeaderRow: string[] = ['ID', 'Gruppe', 'Schüler'];
  
  // First semester section
  data.amTeachers.forEach(teacher => {
    simpleHeaderRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  data.pmTeachers.forEach(teacher => {
    simpleHeaderRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  simpleHeaderRow.push('Ø 1. Sem.');
  simpleHeaderRow.push('Endnote');
  simpleHeaderRow.push('Betr. (Wunsch)');

  // Second semester section
  data.amTeachers.forEach(teacher => {
    simpleHeaderRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  data.pmTeachers.forEach(teacher => {
    simpleHeaderRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  simpleHeaderRow.push('Ø 2. Sem.');
  simpleHeaderRow.push('Endnote');
  simpleHeaderRow.push('Betr. (Wunsch)');

  autoTable(doc, {
    startY: yPos,
    head: [simpleHeaderRow],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: headerColor,
      textColor: textColor,
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 7,
      textColor: textColor,
    },
    columnStyles,
    styles: {
      cellPadding: 2,
      lineWidth: 0.3,
      lineColor: borderColor,
    },
    margin: { left: margin, right: margin },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (cellData: any) => {
      const colIndex = Number(cellData.column.index);
      const firstAvgCol = 3 + data.amTeachers.length + data.pmTeachers.length;
      const firstEndnoteCol = firstAvgCol + 1;
      const firstConductWishCol = firstEndnoteCol + 1;
      const secondAvgCol = firstConductWishCol + 1 + data.amTeachers.length + data.pmTeachers.length;
      const secondEndnoteCol = secondAvgCol + 1;
      const secondConductWishCol = secondEndnoteCol + 1;
      const avgOrEndnoteCols = [firstAvgCol, firstEndnoteCol, secondAvgCol, secondEndnoteCol];
      const conductWishCols = [firstConductWishCol, secondConductWishCol];
      if (cellData.section === 'body') {
        if (avgOrEndnoteCols.includes(colIndex)) {
          cellData.cell.styles.fillColor = averageColor;
          if (colIndex === firstAvgCol || colIndex === secondAvgCol) {
            cellData.cell.styles.fontStyle = 'bold';
          }
        } else if (conductWishCols.includes(colIndex)) {
          cellData.cell.styles.fillColor = [245, 245, 245];
        }
      }
    },
  });

  yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  // Footer
  const footerY = pageHeight - 5;
  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  const today = formatDateGerman(new Date());
  doc.text(`erstellt am: ${today}`, pageWidth - margin, footerY, { align: 'right' });

  // Return PDF as buffer
  return Buffer.from(doc.output('arraybuffer'));
}

// --- Notensammler "all classes" (one teacher) PDF ---

export interface NotensammlerAllClassesClassData {
  className: string;
  subjectName?: string;
  students: Array<{
    id: number;
    firstName: string;
    lastName: string;
    groupId: number | null;
  }>;
  grades: Record<number, { first: number | null; second: number | null }>;
  finalGrades?: Record<number, {
    first: number | null;
    second: number | null;
    conductWishFirst?: string | null;
    conductWishSecond?: string | null;
  }>;
}

export interface NotensammlerAllClassesPDFData {
  teacherName: string;
  classes: NotensammlerAllClassesClassData[];
}

const CLASSES_PER_PAGE = 4;
const GAP_BETWEEN_COLUMNS_MM = 4;
const TITLE_HEIGHT_MM = 5;
const FOOTER_HEIGHT_MM = 8;
const MAX_STUDENTS_PER_CLASS = 36;

/**
 * Generates a PDF with one table per class side-by-side (no averages or final grades).
 * Exactly 4 classes per page in one row; row height sized so up to 36 students fit.
 */
export async function generateNotensammlerAllClassesPDF(data: NotensammlerAllClassesPDFData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;

  const textColor: [number, number, number] = [0, 0, 0];
  const borderColor: [number, number, number] = [0, 0, 0];
  const headerColor: [number, number, number] = [240, 240, 240];

  const NICHT_BEURTEILT = 6;
  const GESTUNDEN = 7;

  const getGradeDisplayText = (grade: number | null): string => {
    if (grade === null) return '';
    if (grade === NICHT_BEURTEILT) return 'nb';
    if (grade === GESTUNDEN) return 'gs';
    return grade.toString();
  };

  const availableWidth = pageWidth - margin * 2;
  const totalGaps = (CLASSES_PER_PAGE - 1) * GAP_BETWEEN_COLUMNS_MM;
  const colWidth = (availableWidth - totalGaps) / CLASSES_PER_PAGE;

  const tableAreaHeight = pageHeight - margin * 2 - TITLE_HEIGHT_MM - FOOTER_HEIGHT_MM;
  const rowHeightMm = tableAreaHeight / (MAX_STUDENTS_PER_CLASS + 1);
  const cellPaddingMm = Math.max(0.3, (rowHeightMm - 2) / 2);

  const classes = data.classes;
  let pageStartIndex = 0;
  let isFirstPage = true;

  while (pageStartIndex < classes.length) {
    if (pageStartIndex > 0) {
      doc.addPage([pageWidth, pageHeight], 'landscape');
      isFirstPage = false;
    }

    const pageClasses = classes.slice(pageStartIndex, pageStartIndex + CLASSES_PER_PAGE);
    let yPos = margin;

    if (isFirstPage && pageStartIndex === 0) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Notensammler', pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(data.teacherName, pageWidth / 2, yPos, { align: 'center' });
      yPos += 6;
    }

    const rowTableStartY = yPos + TITLE_HEIGHT_MM;

    for (let colIndex = 0; colIndex < pageClasses.length; colIndex++) {
      const classData = pageClasses[colIndex]!;

      const classDisplayText = classData.subjectName
        ? `${classData.className} - ${truncateSubject(classData.subjectName)}`
        : classData.className;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(classDisplayText, margin + colIndex * (colWidth + GAP_BETWEEN_COLUMNS_MM), yPos);

      const sortedStudents = [...classData.students]
        .filter(s => s.groupId != null)
        .sort((a, b) => {
          const ln = a.lastName.localeCompare(b.lastName);
          if (ln !== 0) return ln;
          return a.firstName.localeCompare(b.firstName);
        });

      const grades = classData.grades;
      const getGrade = (studentId: number, semester: 'first' | 'second'): number | null =>
        grades[studentId]?.[semester] ?? null;

      const headerRow: string[] = ['ID', 'Gr', 'Schüler', '1.', '2.'];
      const tableData: string[][] = [];
      for (let i = 0; i < sortedStudents.length; i++) {
        const student = sortedStudents[i]!;
        tableData.push([
          (i + 1).toString(),
          student.groupId?.toString() ?? '-',
          `${student.lastName}, ${student.firstName}`,
          getGradeDisplayText(getGrade(student.id, 'first')),
          getGradeDisplayText(getGrade(student.id, 'second'))
        ]);
      }

      const tableLeft = margin + colIndex * (colWidth + GAP_BETWEEN_COLUMNS_MM);
      const tableRight = pageWidth - tableLeft - colWidth;
      const w = colWidth;
      const idW = 6;
      const grW = 6;
      const semW = 10;
      const studentW = Math.max(25, w - idW - grW - semW - semW);
      const columnStyles: Record<number, { cellWidth: number }> = {
        0: { cellWidth: idW },
        1: { cellWidth: grW },
        2: { cellWidth: studentW },
        3: { cellWidth: semW },
        4: { cellWidth: semW }
      };

      autoTable(doc, {
        startY: rowTableStartY,
        head: [headerRow],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: headerColor,
          textColor: textColor,
          fontStyle: 'bold',
          fontSize: 5,
          halign: 'center',
          minCellHeight: rowHeightMm
        },
        bodyStyles: {
          fontSize: 5,
          textColor: textColor,
          minCellHeight: rowHeightMm
        },
        columnStyles,
        styles: {
          cellPadding: cellPaddingMm,
          lineWidth: 0.15,
          lineColor: borderColor,
          minCellHeight: rowHeightMm
        },
        margin: { left: tableLeft, right: tableRight }
      });
    }

    pageStartIndex += pageClasses.length;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'italic');
    doc.text(
      `erstellt am: ${formatDateGerman(new Date())}`,
      pageWidth - margin,
      pageHeight - 5,
      { align: 'right' }
    );
  }

  return Buffer.from(doc.output('arraybuffer'));
}