/**
 * Helper functions for converting between scheduleData JSON format
 * and normalized ScheduleTurn/ScheduleWeek database structure
 */

import type { ScheduleWeek, ScheduleTerm, TurnSchedule } from '@/types/schedule'
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

/**
 * Converts normalized database structure to the legacy JSON format
 */
export function normalizeToJsonFormat(
	turns: Array<{
		name: string
		customLength?: number | null
		weeks: Array<{
			date: string
			week: string
			isHoliday: boolean
		}>
		holidays?: Array<{
			holiday: {
				id: number
				name: string
				startDate: Date
				endDate: Date
			}
		}>
	}>
): TurnSchedule {
	const result: TurnSchedule = {}
	
	for (const turn of turns) {
		result[turn.name] = {
			name: turn.name,
			weeks: turn.weeks.map(w => ({
				date: w.date,
				week: w.week,
				isHoliday: w.isHoliday
			})),
			holidays: turn.holidays?.map(h => {
				// Handle both Date objects and ISO strings from Prisma
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
	
	let order = 0
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
		order++
	}
	
	return result
}

/**
 * Creates Prisma data structure for creating ScheduleTurn with weeks and holidays
 * For nested creates (when scheduleId is 0), omit the schedule connection
 */
export function createScheduleTurnData(
	turnData: ScheduleTurnData,
	order: number
): Prisma.ScheduleTurnCreateInput {
	return {
		name: turnData.name,
		customLength: turnData.customLength ?? null,
		order,
		weeks: {
			create: turnData.weeks.map(week => ({
				date: week.date,
				week: week.week,
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

