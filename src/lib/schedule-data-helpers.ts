/**
 * Helper functions for converting between scheduleData JSON format
 * and normalized ScheduleTurn/ScheduleWeek database structure.
 *
 * Note: as of Phase 3a, ScheduleWeek.date is stored as DATE and
 * ScheduleWeek.week as INTEGER (ISO week). At the API boundary we still
 * expose the legacy display strings ("dd.MM.yy" / "KW##") so existing
 * clients (UI, exports, PDFs) keep working without changes.
 */

import type { ScheduleTerm, TurnSchedule } from '@/types/schedule'
import type { Prisma } from '@prisma/client'

export interface ScheduleTurnData {
	name: string
	customLength?: number | null
	weeks: Array<{
		date: string
		week: string
		isHoliday: boolean
	}>
	holidayIds?: number[]
}

/* ----- Format helpers (DB <-> legacy display strings) ----- */

/** Format a Date as the legacy "dd.MM.yy" string. */
export function formatScheduleWeekDate(date: Date | string): string {
	const d = date instanceof Date ? date : new Date(date)
	if (Number.isNaN(d.getTime())) return ''
	const dd = String(d.getUTCDate()).padStart(2, '0')
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
	const yy = String(d.getUTCFullYear() % 100).padStart(2, '0')
	return `${dd}.${mm}.${yy}`
}

/** Format an ISO week number (Int) as the legacy "KW##" string. */
export function formatScheduleWeekLabel(week: number | string): string {
	const n = typeof week === 'number' ? week : parseInt(String(week).replace(/^KW/i, ''), 10)
	if (Number.isNaN(n)) return ''
	return `KW${n}`
}

/** Parse "dd.MM.yy" back to a Date (UTC midnight). Used by writes. */
export function parseScheduleWeekDate(input: string | Date): Date {
	if (input instanceof Date) return input
	const parts = input.split('.')
	if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
		const fallback = new Date(input)
		return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback
	}
	const dd = parseInt(parts[0], 10)
	const mm = parseInt(parts[1], 10) - 1
	const yyRaw = parseInt(parts[2], 10)
	const yyyy = yyRaw < 100 ? 2000 + yyRaw : yyRaw
	return new Date(Date.UTC(yyyy, mm, dd))
}

/** Parse "KW##" or "##" to an ISO week int. Used by writes. */
export function parseScheduleWeekLabel(input: string | number): number {
	if (typeof input === 'number') return input
	const stripped = String(input).replace(/^KW/i, '')
	const n = parseInt(stripped, 10)
	return Number.isNaN(n) ? 0 : n
}

/**
 * Converts normalized database structure to the legacy JSON format.
 * Accepts either typed (Date/Int) or legacy (string) values for `date`/`week`
 * so callers can pass raw Prisma rows.
 */
export function normalizeToJsonFormat(
	turns: Array<{
		name: string
		customLength?: number | null
		weeks: Array<{
			date: Date | string
			week: number | string
			isHoliday: boolean
		}>
		holidays?: Array<{
			holiday: {
				id: number
				name: string
				startDate: Date | string
				endDate: Date | string
			}
		}>
	}>
): TurnSchedule {
	const result: TurnSchedule = {}

	for (const turn of turns) {
		result[turn.name] = {
			name: turn.name,
			weeks: turn.weeks.map(w => ({
				date: typeof w.date === 'string' ? w.date : formatScheduleWeekDate(w.date),
				week: typeof w.week === 'string' ? w.week : formatScheduleWeekLabel(w.week),
				isHoliday: w.isHoliday
			})),
			holidays: turn.holidays?.map(h => {
				const startDate = h.holiday.startDate instanceof Date
					? h.holiday.startDate.toISOString()
					: typeof h.holiday.startDate === 'string'
					? h.holiday.startDate
					: new Date(h.holiday.startDate).toISOString()

				const endDate = h.holiday.endDate instanceof Date
					? h.holiday.endDate.toISOString()
					: typeof h.holiday.endDate === 'string'
					? h.holiday.endDate
					: new Date(h.holiday.endDate).toISOString()

				return {
					id: h.holiday.id,
					name: h.holiday.name,
					startDate,
					endDate
				}
			}) ?? [],
			customLength: turn.customLength ?? undefined
		}
	}

	return result
}

/**
 * Converts legacy JSON format to normalized database structure
 */
export function parseJsonToNormalized(
	scheduleData: unknown
): ScheduleTurnData[] {
	if (!scheduleData || typeof scheduleData !== 'object') {
		return []
	}

	const data = scheduleData as Record<string, ScheduleTerm>
	const result: ScheduleTurnData[] = []

	for (const [turnName, turnData] of Object.entries(data)) {
		if (!turnData || typeof turnData !== 'object') continue

		result.push({
			name: turnName,
			customLength: turnData.customLength ?? null,
			weeks: Array.isArray(turnData.weeks)
				? turnData.weeks.map(w => ({
					date: String(w.date ?? ''),
					week: String(w.week ?? ''),
					isHoliday: Boolean(w.isHoliday)
				}))
				: [],
			holidayIds: Array.isArray(turnData.holidays)
				? turnData.holidays.map(h => typeof h === 'object' && h !== null && 'id' in h ? Number(h.id) : 0).filter(id => id > 0)
				: []
		})
	}

	return result
}

/**
 * Creates Prisma data structure for creating ScheduleTurn with weeks and holidays.
 * Converts legacy "dd.MM.yy" / "KW##" strings to typed Date/Int values for the DB.
 * For nested creates (when scheduleId is 0), omit the schedule connection.
 */
export function createScheduleTurnData(
	turnData: ScheduleTurnData,
	order: number
): Omit<Prisma.ScheduleTurnCreateInput, 'schedule'> {
	return {
		name: turnData.name,
		customLength: turnData.customLength ?? null,
		order,
		weeks: {
			create: turnData.weeks.map(week => ({
				date: parseScheduleWeekDate(week.date),
				week: parseScheduleWeekLabel(week.week),
				isHoliday: week.isHoliday
			}))
		},
		holidays: turnData.holidayIds && turnData.holidayIds.length > 0 ? {
			create: turnData.holidayIds.map(holidayId => ({
				holiday: {
					connect: { id: holidayId }
				}
			}))
		} : undefined
	}
}
