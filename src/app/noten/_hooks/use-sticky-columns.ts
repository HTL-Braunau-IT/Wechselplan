import { useCallback, useEffect, useRef, useState } from 'react'

/** Width of the leading checkbox column, which the name column sits after. */
export const CHECKBOX_COLUMN_WIDTH_PX = 40

type Params = {
	/** Re-measure whenever the grid's shape changes. */
	deps: unknown[]
	/** Column to scroll into view: today's, or the searched date's. */
	focusColumnKey: string | null
	/** Reset the one-shot scroll when the grid switches to different data. */
	resetKey: string
}

/**
 * DOM measurement for the grid's frozen left columns, plus the one-time scroll
 * to today's column.
 *
 * Purely presentational bookkeeping — seven refs and a rAF loop that had no
 * business sitting in the page component.
 */
export function useStickyColumns({ deps, focusColumnKey, resetKey }: Params) {
	const nameColumnRef = useRef<HTMLTableCellElement | null>(null)
	const todayColumnRef = useRef<HTMLTableCellElement | null>(null)
	const dayColumnRefs = useRef<Record<string, HTMLTableCellElement | null>>({})
	const hasScrolledRef = useRef(false)

	// The Sitzplatz column is frozen too, so its offset depends on how wide the
	// name column rendered.
	const [sitzplatzLeft, setSitzplatzLeft] = useState('0px')

	useEffect(() => {
		if (!nameColumnRef.current) return
		setSitzplatzLeft(`${CHECKBOX_COLUMN_WIDTH_PX + nameColumnRef.current.offsetWidth}px`)
	}, deps)

	useEffect(() => {
		hasScrolledRef.current = false
	}, [resetKey])

	useEffect(() => {
		if (!focusColumnKey || hasScrolledRef.current) return
		const raf = requestAnimationFrame(() => {
			if (hasScrolledRef.current) return
			const column = dayColumnRefs.current[focusColumnKey] ?? todayColumnRef.current
			if (column) {
				column.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
				hasScrolledRef.current = true
			}
		})
		return () => cancelAnimationFrame(raf)
	}, [focusColumnKey])

	const registerDayColumn = useCallback(
		(key: string, isToday: boolean) => (el: HTMLTableCellElement | null) => {
			dayColumnRefs.current[key] = el
			if (isToday) todayColumnRef.current = el
		},
		[]
	)

	return { nameColumnRef, sitzplatzLeft, registerDayColumn }
}
