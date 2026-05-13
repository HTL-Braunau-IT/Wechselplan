import { describe, expect, it } from 'vitest'
import {
	computePmTrackByWeekKey,
	spurForIncludedIndex,
	flattenTurnWeeksSorted,
	weekPmTrackKey,
	turnScheduleHasPmRhythm,
	pmNachmittagJa
} from '@/lib/pm-biweekly-track'
import type { TurnSchedule } from '@/types/schedule'

describe('pm-biweekly-track', () => {
	it('toggle swaps A/B for same included index', () => {
		expect(spurForIncludedIndex('A_ON_ODD_WEEKS', 1)).toBe('A')
		expect(spurForIncludedIndex('A_ON_EVEN_WEEKS', 1)).toBe('B')
		expect(spurForIncludedIndex('A_ON_ODD_WEEKS', 2)).toBe('B')
		expect(spurForIncludedIndex('A_ON_EVEN_WEEKS', 2)).toBe('A')
	})

	it('excluded middle week shifts subsequent spurs', () => {
		const turns = [
			{
				name: 'T1',
				order: 0,
				weeks: [
					{ date: '01.09.25', includedInPlan: true },
					{ date: '08.09.25', includedInPlan: false },
					{ date: '15.09.25', includedInPlan: true }
				]
			}
		]
		const m = computePmTrackByWeekKey('A_ON_ODD_WEEKS', turns)
		expect(m.get(weekPmTrackKey('T1', '01.09.25'))).toBe('A')
		expect(m.get(weekPmTrackKey('T1', '08.09.25'))).toBe(null)
		expect(m.get(weekPmTrackKey('T1', '15.09.25'))).toBe('B')
	})

	it('turnScheduleHasPmRhythm is false when anchor would yield no A/B on included weeks', () => {
		const turns = {
			T1: {
				name: 'T1',
				weeks: [{ date: '01.09.25', week: 'KW36', isHoliday: false, includedInPlan: false, pmTrack: null }]
			}
		} as TurnSchedule
		expect(turnScheduleHasPmRhythm(turns)).toBe(false)
	})

	it('pmNachmittagJa respects track vs week spur', () => {
		expect(pmNachmittagJa('A', { includedInPlan: true, pmTrack: 'A' })).toBe(true)
		expect(pmNachmittagJa('A', { includedInPlan: true, pmTrack: 'B' })).toBe(false)
		expect(pmNachmittagJa('ALL', { includedInPlan: true, pmTrack: 'B' })).toBe(true)
		expect(pmNachmittagJa('A', { includedInPlan: false, pmTrack: 'A' })).toBe(false)
	})

	it('flattenTurnWeeksSorted orders globally by date', () => {
		const flat = flattenTurnWeeksSorted([
			{
				name: 'T2',
				order: 1,
				weeks: [{ date: '22.09.25', includedInPlan: true }]
			},
			{
				name: 'T1',
				order: 0,
				weeks: [{ date: '15.09.25', includedInPlan: true }]
			}
		])
		expect(flat.map((r) => r.date)).toEqual(['15.09.25', '22.09.25'])
	})
})
