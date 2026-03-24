/**
 * Untis absence helper functions
 */

/**
 * Convert minutes from midnight to HH:MM format
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Check if an absence covers the full day (both AM and PM periods)
 * 
 * @param startTime Minutes from midnight (e.g., 480 for 08:00)
 * @param endTime Minutes from midnight (e.g., 1020 for 17:00)
 * @returns true if absence covers both AM (< 11:30) and PM (>= 12:00) periods
 */
export function isCoveringFullDay(startTime: number, endTime: number): boolean {
  const AM_END = 11 * 60 + 30 // 11:30 = 690 minutes
  const PM_START = 12 * 60 // 12:00 = 720 minutes

  // Full day coverage: starts before 11:30 AND ends after 12:00
  return startTime < AM_END && endTime > PM_START
}

/**
 * Create a German text description of absence time range
 * Format: "Abwesend HH:MM-HH:MM Uhr (Grund)"
 */
export function createAbsenceText(
  startTime: number,
  endTime: number,
  reason?: string
): string {
  const start = minutesToTime(startTime)
  const end = minutesToTime(endTime)
  const reasonText = reason ? ` (${reason})` : ''
  return `Abwesend ${start}-${end} Uhr${reasonText}`
}

/**
 * Append absence information to existing text field
 * Prevents duplication and preserves existing content
 */
export function appendAbsenceToText(existingText: string | null | undefined, newAbsenceText: string): string {
  if (!existingText) {
    return newAbsenceText
  }

  // Check if absence text already exists to prevent duplicates
  if (existingText.includes('Abwesend')) {
    // Already has absence info, don't duplicate
    return existingText
  }

  // Append with newline if text exists
  return `${existingText}\n${newAbsenceText}`
}
