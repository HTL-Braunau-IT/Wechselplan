/**
 * Format a Date as YYYY-MM-DD in local time (no timezone shift).
 * Use this when serializing calendar dates for API responses or display
 * to avoid off-by-one day errors in timezones ahead of UTC.
 */
export function toLocalDateString(d: Date): string {
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}
