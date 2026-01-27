/**
 * Helper functions for PDF generation
 */

/**
 * Returns the German name of the weekday for a given number.
 * @param weekday - The weekday number, where 0 represents Sunday and 6 represents Saturday.
 * @returns The German name of the weekday, or 'Unbekannt' if the number is outside the 0–6 range.
 */
export function getWeekdayName(weekday: number): string {
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  return days[weekday] ?? 'Unbekannt';
}

/**
 * Returns the abbreviated German weekday name.
 * @param weekday - The weekday number (0-6)
 * @returns Abbreviated weekday (So, Mo, Di, Mi, Do, Fr, Sa)
 */
export function getWeekdayAbbr(weekday: number): string {
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  return days[weekday] ?? '';
}

/**
 * Calculates the calendar week (KW) for a given date using ISO 8601 standard.
 * @param date - The date to calculate the week for
 * @returns The calendar week number (1-53)
 */
export function getCalendarWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Formats a date string to German format with weekday abbreviation.
 * @param dateStr - Date string in format "DD.MM.YY" or similar
 * @returns Formatted string like "Mo - 09.09" or empty string if invalid
 */
export function formatDateWithWeekday(dateStr: string): string {
  if (!dateStr) return '';
  
  // Try to parse the date string
  // Handle formats like "09.09.2024" or "09.09.24"
  const parts = dateStr.trim().split('.');
  if (parts.length < 2) return dateStr;
  
  try {
    if (!parts[0] || !parts[1]) return dateStr;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    let year = parseInt(parts[2] ?? '', 10);
    
    // Handle 2-digit years
    if (year && year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    } else if (!year) {
      year = new Date().getFullYear();
    }
    
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return dateStr;
    
    const weekday = date.getDay();
    const weekdayAbbr = getWeekdayAbbr(weekday);
    return `${weekdayAbbr} - ${String(day).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}

/**
 * Formats a date to German format (DD.MM.YYYY).
 * @param date - Date object or date string
 * @returns Formatted date string
 */
export function formatDateGerman(date: Date | string): string {
  if (!date) return '';
  
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Extracts turnus information including calendar weeks.
 * @param turnKey - The key identifying the turn
 * @param turns - The turns object from schedule data
 * @returns Object with start, end, days, startKW, endKW, and formatted dates
 */
export function getTurnusInfo(turnKey: string, turns: Record<string, unknown>) {
  if (!turns || typeof turns !== 'object') {
    return { 
      start: '', 
      end: '', 
      days: 0, 
      startKW: 0, 
      endKW: 0,
      startFormatted: '',
      endFormatted: '',
      startDayFormatted: '',
      endDayFormatted: ''
    };
  }
  
  const entry = turns[turnKey] as { weeks?: { date: string; week?: string }[] };
  if (!entry?.weeks?.length) {
    return { 
      start: '', 
      end: '', 
      days: 0, 
      startKW: 0, 
      endKW: 0,
      startFormatted: '',
      endFormatted: '',
      startDayFormatted: '',
      endDayFormatted: ''
    };
  }
  
  const weeks = entry.weeks;
  const startDateStr = weeks[0]?.date?.replace(/^-\s*/, '')?.trim() ?? '';
  const endDateStr = weeks[weeks.length - 1]?.date?.replace(/^-\s*/, '')?.trim() ?? '';
  
  // Parse dates to calculate calendar weeks
  let startKW = 0;
  let endKW = 0;
  let startDayFormatted = '';
  let endDayFormatted = '';
  
  if (startDateStr) {
    try {
      const parts = startDateStr.split('.');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2] ?? '', 10);
        if (year && year < 100) {
          year = year < 50 ? 2000 + year : 1900 + year;
        } else if (!year) {
          year = new Date().getFullYear();
        }
        const startDate = new Date(year, month, day);
        if (!isNaN(startDate.getTime())) {
          startKW = getCalendarWeek(startDate);
          startDayFormatted = formatDateWithWeekday(startDateStr);
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }
  
  if (endDateStr) {
    try {
      const parts = endDateStr.split('.');
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2] ?? '', 10);
        if (year && year < 100) {
          year = year < 50 ? 2000 + year : 1900 + year;
        } else if (!year) {
          year = new Date().getFullYear();
        }
        const endDate = new Date(year, month, day);
        if (!isNaN(endDate.getTime())) {
          endKW = getCalendarWeek(endDate);
          endDayFormatted = formatDateWithWeekday(endDateStr);
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }
  
  // Format KW range
  const kwRange = startKW && endKW ? `KW ${startKW}-${endKW}` : 
                  startKW ? `KW ${startKW}` : 
                  endKW ? `KW ${endKW}` : '';
  
  return {
    start: startDateStr,
    end: endDateStr,
    days: weeks.length,
    startKW,
    endKW,
    kwRange,
    startFormatted: startDateStr,
    endFormatted: endDateStr,
    startDayFormatted: startDayFormatted || startDateStr,
    endDayFormatted: endDayFormatted || endDateStr
  };
}

/**
 * Gets the school year from a date (format: YYYY/YY+1).
 * @param date - Optional date, defaults to current date
 * @returns School year string like "2024/25"
 */
export function getSchoolYear(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  // School year typically starts in September
  const month = d.getMonth();
  if (month >= 8) { // September (8) onwards
    return `${year}/${String(year + 1).slice(-2)}`;
  } else {
    return `${year - 1}/${String(year).slice(-2)}`;
  }
}

