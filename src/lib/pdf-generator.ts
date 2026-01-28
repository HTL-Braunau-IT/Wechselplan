import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  getTurnusInfo, 
  getWeekdayName, 
  getWeekdayAbbr,
  getSchoolYear, 
  formatDateGerman 
} from './pdf-helpers';

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
}

/**
 * Truncates subject name according to the pattern:
 * - "PBE4-Verbindungstechnik 1" → "PBE_4"
 * - "PBE4-Mech. Grundausbildung" → "PBE_4"
 * - "COPR-Elektrotechnik" → "COPR"
 * - "COPR-Elektronische Grundschaltungen" → "COPR"
 * - "ELWP-Elektrotechnik" → "ELWP_4"
 * - "NWWP-Naturwissenschaften" → "NWWP_4"
 */
function truncateSubject(subjectName: string): string {
  // Extract prefix before hyphen
  const parts = subjectName.split('-');
  const prefix = (parts[0] ?? subjectName).trim();
  
  // Check if prefix ends with digits
  const match = prefix.match(/^(.+?)(\d+)$/);
  if (match && match[1] && match[2]) {
    // Add underscore before digits: "PBE4" → "PBE_4"
    return `${match[1]}_${match[2]}`;
  }
  
  // Special case: ELWP and NWWP get "_4" appended
  if (prefix === 'ELWP' || prefix === 'NWWP') {
    return `${prefix}_4`;
  }
  
  // No trailing digits, return as-is: "COPR" → "COPR"
  return prefix;
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

  // Calculate averages for each student
  const calculateAverage = (studentId: number, semester: 'first' | 'second'): number | null => {
    const studentGrades = data.grades[studentId];
    if (!studentGrades) return null;

    const gradeValues: number[] = [];
    for (const teacherId in studentGrades) {
      const teacherGrades = studentGrades[parseInt(teacherId)];
      if (teacherGrades) {
        const grade = teacherGrades[semester];
        if (grade !== null && grade !== undefined) {
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
  
  // Second semester headers
  data.amTeachers.forEach(teacher => {
    headerRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  data.pmTeachers.forEach(teacher => {
    headerRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  headerRow.push('Ø 2. Sem.'); // Second semester average

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
      row.push(grade !== null ? grade.toString() : '');
    });
    data.pmTeachers.forEach(teacher => {
      const grade = getGrade(student.id, teacher.id, 'first');
      row.push(grade !== null ? grade.toString() : '');
    });
    
    // First semester average
    const firstAvg = calculateAverage(student.id, 'first');
    row.push(firstAvg !== null ? firstAvg.toFixed(1) : '-');

    // Second semester grades
    data.amTeachers.forEach(teacher => {
      const grade = getGrade(student.id, teacher.id, 'second');
      row.push(grade !== null ? grade.toString() : '');
    });
    data.pmTeachers.forEach(teacher => {
      const grade = getGrade(student.id, teacher.id, 'second');
      row.push(grade !== null ? grade.toString() : '');
    });
    
    // Second semester average
    const secondAvg = calculateAverage(student.id, 'second');
    row.push(secondAvg !== null ? secondAvg.toFixed(1) : '-');

    tableData.push(row);
  });

  // Calculate column widths
  const totalTeachers = data.amTeachers.length + data.pmTeachers.length;
  const numColumns = 3 + (totalTeachers * 2) + 2; // ID, Gruppe, Schüler, teachers (2 semesters), averages (2)
  const availableWidth = pageWidth - (margin * 2);
  const fixedColumnWidth = 15; // For ID, Gruppe columns
  const studentColumnWidth = 50; // For student name
  const averageColumnWidth = 12; // For average columns (reduced from 20mm)
  const teacherColumnWidth = (availableWidth - (fixedColumnWidth * 2) - studentColumnWidth - (averageColumnWidth * 2)) / (totalTeachers * 2);

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

  // Create a more complex header structure (unused, but kept for reference)
  const topHeaderRow: any[] = [
    { content: '', rowSpan: 2 },
    { content: '', rowSpan: 2 },
    { content: '', rowSpan: 2 },
    { content: '1. Semester', colSpan: totalTeachers },
    { content: '', rowSpan: 2 },
    { content: '2. Semester', colSpan: totalTeachers },
    { content: '', rowSpan: 2 },
  ];

  const secondHeaderRow: string[] = [];
  // First semester
  data.amTeachers.forEach(() => secondHeaderRow.push(''));
  if (data.amTeachers.length > 0 && data.pmTeachers.length > 0) {
    secondHeaderRow.push('');
  }
  data.pmTeachers.forEach(() => secondHeaderRow.push(''));
  secondHeaderRow.push(''); // Average column
  // Second semester
  data.amTeachers.forEach(() => secondHeaderRow.push(''));
  if (data.amTeachers.length > 0 && data.pmTeachers.length > 0) {
    secondHeaderRow.push('');
  }
  data.pmTeachers.forEach(() => secondHeaderRow.push(''));
  secondHeaderRow.push(''); // Average column

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
  
  // Second semester section
  data.amTeachers.forEach(teacher => {
    simpleHeaderRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  data.pmTeachers.forEach(teacher => {
    simpleHeaderRow.push(`${teacher.firstName} ${teacher.lastName}`);
  });
  simpleHeaderRow.push('Ø 2. Sem.');

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
      const colIndex = cellData.column.index;
      
      // Calculate first semester average column index
      // 3 fixed columns + amTeachers + pmTeachers
      const firstAvgCol = 3 + data.amTeachers.length + data.pmTeachers.length;
      
      // Calculate second semester average column index
      // After first avg: firstAvgCol + 1 + amTeachers + pmTeachers
      const secondAvgCol = firstAvgCol + 1 + data.amTeachers.length + data.pmTeachers.length;
      
      // Style average columns
      if (cellData.section === 'body' && (colIndex === firstAvgCol || colIndex === secondAvgCol)) {
        cellData.cell.styles.fillColor = averageColor;
        cellData.cell.styles.fontStyle = 'bold';
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