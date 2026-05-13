import { parse, isValid, isWithinInterval, addWeeks } from 'date-fns'
import { pmNachmittagJa } from '@/lib/pm-biweekly-track'
import type { NormalizedTurn, TurnSchedule } from '@/types/schedule'

export type CurrentCalendarWeekRow = {
	turnIndex: number
	turn: NormalizedTurn
	week: NormalizedTurn['weeks'][number]
}

/**
 * First calendar week row (by turn order, then week order) whose interval contains `currentDate`
 * and which is included in the plan. Matches teacher overview / rotation semantics.
 */
export function getCurrentCalendarWeekRow(
	turns: NormalizedTurn[] | undefined,
	currentDate: Date
): CurrentCalendarWeekRow | null {
	if (!turns?.length) return null
	for (let i = 0; i < turns.length; i++) {
		const turn = turns[i]
		if (!turn) continue
		for (const week of turn.weeks) {
			if (week.includedInPlan === false) continue
			const parsedDate = parse(week.date, 'dd.MM.yy', new Date())
			if (!isValid(parsedDate)) continue
			const weekEnd = addWeeks(parsedDate, 1)
			if (isWithinInterval(currentDate, { start: parsedDate, end: weekEnd })) {
				return { turnIndex: i, turn, week }
			}
		}
	}
	return null
}

export function normalizedTurnsToTurnSchedule(turns: NormalizedTurn[]): TurnSchedule {
	return Object.fromEntries(
		turns.map((t) => [t.name, { name: t.name, weeks: t.weeks }])
	) as TurnSchedule
}

/** Full timetable / student list only when this calendar week is a normal teaching week for that period. */
export function teacherOverviewShowFullAssignmentCard(
	assignment: { period: string; pmTrack?: 'ALL' | 'A' | 'B' },
	row: CurrentCalendarWeekRow | null,
	turnsLength: number,
	hasPmRhythm: boolean
): boolean {
	if (!turnsLength || !row) return false
	if (row.week.isHoliday) return false
	if (assignment.period === 'AM') return true
	if (assignment.period === 'PM') {
		return !hasPmRhythm || pmNachmittagJa(assignment.pmTrack, row.week)
	}
	return true
}
