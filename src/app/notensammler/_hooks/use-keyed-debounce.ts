import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Debounce work per key, and flush or cancel everything on demand.
 *
 * The grade grid previously shared a single timer across every cell, so typing
 * a mark for one student and then another within the debounce window cancelled
 * the first save outright — the grade stayed on screen but never reached the
 * server. Keying the timers means each cell settles independently.
 *
 * `pendingCount` is how many edits are still waiting for their timer. The page
 * uses it to show "nicht gespeichert" and to warn before the tab is closed:
 * with a 500 ms debounce, a mark typed and immediately followed by Cmd-W was
 * silently lost.
 */
export function useKeyedDebounce(delayMs: number) {
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const [pendingCount, setPendingCount] = useState(0)

  const sync = useCallback(() => setPendingCount(timersRef.current.size), [])

  const cancel = useCallback(
    (key: string) => {
      const timer = timersRef.current.get(key)
      if (timer) {
        clearTimeout(timer)
        timersRef.current.delete(key)
        sync()
      }
    },
    [sync],
  )

  const cancelAll = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer)
    }
    timersRef.current.clear()
    setPendingCount(0)
  }, [])

  const schedule = useCallback(
    (key: string, run: () => void) => {
      const existing = timersRef.current.get(key)
      if (existing) clearTimeout(existing)

      const timer = setTimeout(() => {
        timersRef.current.delete(key)
        sync()
        run()
      }, delayMs)
      timersRef.current.set(key, timer)
      sync()
    },
    [delayMs, sync],
  )

  // Timers that outlive the page would call setState on an unmounted tree.
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [])

  return { schedule, cancel, cancelAll, pendingCount }
}
