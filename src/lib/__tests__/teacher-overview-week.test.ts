import { describe, expect, it } from 'vitest'
import {
	getCurrentCalendarWeekRow,
	normalizedTurnsToTurnSchedule,
	teacherOverviewShowFullAssignmentCard,
} from '@/lib/teacher-overview-week'
import { pmNachmittagJa, turnScheduleHasPmRhythm } from '@/lib/pm-biweekly-track'
import type { NormalizedTurn } from '@/types/schedule'

function week(date: string, pmTrack: 'A' | 'B' | null = 'A', includedInPlan = true): NormalizedTurn['weeks'][number] {
	return {
		date,
		week: '',
		isHoliday: false,
		includedInPlan,
		pmTrack,
	}
}

describe('getCurrentCalendarWeekRow', () => {
	it('returns first matching included week by turn then week order', () => {
		const turns: NormalizedTurn[] = [
			{
				name: 'T1',
				weeks: [week('01.09.25', 'A'), week('08.09.25', 'B')],
			},
			{
				name: 'T2',
				weeks: [week('15.09.25', 'A')],
			},
		]
		const current = new Date(2025, 8, 10)
		const row = getCurrentCalendarWeekRow(turns, current)
		expect(row?.turn.name).toBe('T1')
		expect(row?.week.date).toBe('08.09.25')
		expect(row?.week.pmTrack).toBe('B')
	})

	it('skips excluded weeks and finds next interval', () => {
		const turns: NormalizedTurn[] = [
			{
				name: 'T1',
				weeks: [week('01.09.25', 'A', false), week('08.09.25', 'B')],
			},
		]
		const current = new Date(2025, 8, 9)
		const row = getCurrentCalendarWeekRow(turns, current)
		expect(row?.week.date).toBe('08.09.25')
	})

	it('returns null when no interval matches', () => {
		const turns: NormalizedTurn[] = [
			{
				name: 'T1',
				weeks: [week('01.09.25', 'A')],
			},
		]
		const current = new Date(2026, 0, 1)
		expect(getCurrentCalendarWeekRow(turns, current)).toBeNull()
	})
})

describe('teacherOverviewShowFullAssignmentCard', () => {
	it('shows AM when week is in plan and not a holiday', () => {
		const turns: NormalizedTurn[] = [{ name: 'T1', weeks: [week('08.09.25', 'B')] }]
		const row = getCurrentCalendarWeekRow(turns, new Date(2025, 8, 10))
		expect(
			teacherOverviewShowFullAssignmentCard({ period: 'AM' }, row, turns.length, true)
		).toBe(true)
	})

	it('hides AM on holiday week (matches teaching-days semantics)', () => {
		const turns: NormalizedTurn[] = [
			{
				name: 'T1',
				weeks: [{ ...week('08.09.25', 'A'), isHoliday: true }],
			},
		]
		const row = getCurrentCalendarWeekRow(turns, new Date(2025, 8, 10))
		expect(row?.week.isHoliday).toBe(true)
		expect(
			teacherOverviewShowFullAssignmentCard({ period: 'AM' }, row, turns.length, true)
		).toBe(false)
	})

	it('hides PM on holiday even when rhythm is off', () => {
		const turns: NormalizedTurn[] = [
			{
				name: 'T1',
				weeks: [{ ...week('08.09.25', null), isHoliday: true, pmTrack: null }],
			},
		]
		const row = getCurrentCalendarWeekRow(turns, new Date(2025, 8, 10))
		expect(
			teacherOverviewShowFullAssignmentCard({ period: 'PM', pmTrack: 'ALL' }, row, turns.length, false)
		).toBe(false)
	})

	it('hides PM when rhythm on and spur does not match', () => {
		const turns: NormalizedTurn[] = [{ name: 'T1', weeks: [week('08.09.25', 'B')] }]
		const row = getCurrentCalendarWeekRow(turns, new Date(2025, 8, 10))
		expect(
			teacherOverviewShowFullAssignmentCard({ period: 'PM', pmTrack: 'A' }, row, turns.length, true)
		).toBe(false)
	})
})

describe('normalizedTurnsToTurnSchedule + pmNachmittagJa', () => {
	it('marks PM inactive when spur does not match assignment', () => {
		const turns: NormalizedTurn[] = [
			{
				name: 'T1',
				weeks: [week('08.09.25', 'B')],
			},
		]
		const ts = normalizedTurnsToTurnSchedule(turns)
		expect(turnScheduleHasPmRhythm(ts)).toBe(true)
		const row = getCurrentCalendarWeekRow(turns, new Date(2025, 8, 10))
		expect(row).not.toBeNull()
		expect(pmNachmittagJa('A', row!.week)).toBe(false)
		expect(pmNachmittagJa('B', row!.week)).toBe(true)
	})
})
