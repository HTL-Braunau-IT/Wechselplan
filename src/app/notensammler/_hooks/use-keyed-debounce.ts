import { useCallback, useEffect, useRef } from 'react'

/**
 * Debounce work per key, and flush or cancel everything on demand.
 *
 * The grade grid previously shared a single timer across every cell, so typing
 * a mark for one student and then another within the debounce window cancelled
 * the first save outright — the grade stayed on screen but never reached the
 * server. Keying the timers means each cell settles independently.
 */
export function useKeyedDebounce(delayMs: number) {
	const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

	const cancel = useCallback((key: string) => {
		const timer = timersRef.current.get(key)
		if (timer) {
			clearTimeout(timer)
			timersRef.current.delete(key)
		}
	}, [])

	const cancelAll = useCallback(() => {
		for (const timer of timersRef.current.values()) {
			clearTimeout(timer)
		}
		timersRef.current.clear()
	}, [])

	const schedule = useCallback(
		(key: string, run: () => void) => {
			const existing = timersRef.current.get(key)
			if (existing) clearTimeout(existing)

			const timer = setTimeout(() => {
				timersRef.current.delete(key)
				run()
			}, delayMs)
			timersRef.current.set(key, timer)
		},
		[delayMs]
	)

	// Timers that outlive the page would call setState on an unmounted tree.
	useEffect(() => cancelAll, [cancelAll])

	return { schedule, cancel, cancelAll }
}
