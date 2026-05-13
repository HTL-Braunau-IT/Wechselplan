import { parseScheduleWeekDate } from '@/lib/schedule-data-helpers'
import type { TurnSchedule } from '@/types/schedule'

/** Matches Prisma `PmBiweeklyAnchor` (string form for JSON / loose coupling). */
export type PmBiweeklyAnchorValue = 'A_ON_ODD_WEEKS' | 'A_ON_EVEN_WEEKS'

export type PmSpur = 'A' | 'B'

export function weekPmTrackKey(turnName: string, dateDisplay: string): string {
	return `${turnName}\0${dateDisplay}`
}

export function spurForIncludedIndex(anchor: PmBiweeklyAnchorValue, index1Based: number): PmSpur {
	const odd = index1Based % 2 === 1
	if (anchor === 'A_ON_ODD_WEEKS') return odd ? 'A' : 'B'
	return odd ? 'B' : 'A'
}

export type TurnWeekForTrack = {
	turnName: string
	turnOrder: number
	date: string
	includedInPlan: boolean
}

/**
 * Flatten turns (sorted by `order`) into rows for chronological NM spur assignment.
 */
export function flattenTurnWeeksSorted(
	turns: Array<{ name: string; order: number; weeks: Array<{ date: string; includedInPlan?: boolean }> }>
): TurnWeekForTrack[] {
	const flat: TurnWeekForTrack[] = []
	const sortedTurns = [...turns].sort((a, b) => a.order - b.order)
	for (const t of sortedTurns) {
		for (const w of t.weeks) {
			flat.push({
				turnName: t.name,
				turnOrder: t.order,
				date: w.date,
				includedInPlan: w.includedInPlan !== false
			})
		}
	}
	flat.sort((a, b) => {
		const da = parseScheduleWeekDate(a.date).getTime()
		const db = parseScheduleWeekDate(b.date).getTime()
		if (da !== db) return da - db
		return a.turnOrder - b.turnOrder
	})
	return flat
}

/**
 * Map (turnName, date) -> derived NM spur for that week row, or null if excluded or anchor off.
 */
export function computePmTrackByWeekKey(
	anchor: PmBiweeklyAnchorValue | null | undefined,
	turns: Array<{ name: string; order: number; weeks: Array<{ date: string; includedInPlan?: boolean }> }>
): Map<string, PmSpur | null> {
	const map = new Map<string, PmSpur | null>()
	const flat = flattenTurnWeeksSorted(turns)
	let includedIdx = 0
	for (const row of flat) {
		const key = weekPmTrackKey(row.turnName, row.date)
		if (!row.includedInPlan || anchor == null) {
			map.set(key, null)
			continue
		}
		includedIdx++
		map.set(key, spurForIncludedIndex(anchor, includedIdx))
	}
	return map
}

export function isPmBiweeklyAnchor(v: unknown): v is PmBiweeklyAnchorValue {
	return v === 'A_ON_ODD_WEEKS' || v === 'A_ON_EVEN_WEEKS'
}

/** True when NM two-week rhythm is on (not „Aus“): some included week has Spur A or B. */
export function turnScheduleHasPmRhythm(turns: TurnSchedule): boolean {
	for (const term of Object.values(turns)) {
		for (const w of term?.weeks ?? []) {
			if (w.includedInPlan === false) continue
			if (w.pmTrack === 'A' || w.pmTrack === 'B') return true
		}
	}
	return false
}

/**
 * Whether NM applies for this assignment in this week (Ja/Nein in the UI).
 * For the rotation editor (no teacher), pass `'A'` to show Ja on Spur-A weeks (reference for „A = 1., 3., …“).
 */
export function pmNachmittagJa(
	pmTrack: 'ALL' | 'A' | 'B' | undefined,
	week: { includedInPlan?: boolean; pmTrack?: PmSpur | null }
): boolean {
	if (week.includedInPlan === false) return false
	const spur = week.pmTrack
	if (spur !== 'A' && spur !== 'B') return false
	const t = pmTrack ?? 'ALL'
	if (t === 'ALL') return true
	return t === spur
}

/**
 * Attach computed `pmTrack` (`'A' | 'B' | null`) to each week on serialized turn rows.
 */
export function applyPmTracksToSerializedTurns<
	T extends { name: string; order: number; weeks: Array<{ date: string; includedInPlan?: boolean }> }
>(turns: T[], anchor: PmBiweeklyAnchorValue | null | undefined): Array<T & { weeks: Array<T['weeks'][number] & { pmTrack: PmSpur | null }> }> {
	const map = computePmTrackByWeekKey(anchor, turns)
	return turns.map((t) => ({
		...t,
		weeks: t.weeks.map((w) => ({
			...w,
			pmTrack: map.get(weekPmTrackKey(t.name, w.date)) ?? null
		}))
	})) as Array<T & { weeks: Array<T['weeks'][number] & { pmTrack: PmSpur | null }> }>
}

/** Merge computed `pmTrack` into a `TurnSchedule` record (UI / hooks). */
export function applyPmTracksToTurnScheduleRecord(
	turns: TurnSchedule,
	anchor: PmBiweeklyAnchorValue | null | undefined
): TurnSchedule {
	const turnsArr = Object.keys(turns)
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
		.map((name, orderIdx) => ({
			name,
			order: orderIdx,
			weeks: turns[name]!.weeks.map((w) => ({
				date: w.date,
				includedInPlan: w.includedInPlan !== false
			}))
		}))
	const map = computePmTrackByWeekKey(anchor, turnsArr)
	const out: TurnSchedule = {}
	for (const name of Object.keys(turns)) {
		const term = turns[name]!
		out[name] = {
			...term,
			weeks: term.weeks.map((w) => ({
				...w,
				pmTrack: map.get(weekPmTrackKey(name, w.date)) ?? null
			}))
		}
	}
	return out
}
