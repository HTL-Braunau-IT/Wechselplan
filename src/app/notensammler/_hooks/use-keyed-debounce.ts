import { useCallback, useEffect, useRef, useState } from 'react'

type Entry = { timer: NodeJS.Timeout; persists: boolean }

/**
 * Debounce work per key, and flush or cancel everything on demand.
 *
 * The grade grid previously shared a single timer across every cell, so typing
 * a mark for one student and then another within the debounce window cancelled
 * the first save outright — the grade stayed on screen but never reached the
 * server. Keying the timers means each cell settles independently.
 *
 * `pendingCount` is how many *writes* are still waiting for their timer. The
 * page shows "nicht gespeichert" from it and warns before the tab is closed:
 * with a 500 ms debounce, a mark typed and immediately followed by Cmd-W was
 * silently lost. Debounced work that only re-reads state passes
 * `persists: false` so it stays out of that count — a queued refresh is not
 * unsaved work, and counting it flipped the indicator back to "nicht
 * gespeichert" for half a second after every successful save.
 */
export function useKeyedDebounce(delayMs: number) {
  const entriesRef = useRef<Map<string, Entry>>(new Map())
  const [pendingCount, setPendingCount] = useState(0)

  const sync = useCallback(() => {
    let count = 0
    for (const entry of entriesRef.current.values()) if (entry.persists) count++
    setPendingCount(count)
  }, [])

  const cancel = useCallback(
    (key: string) => {
      const entry = entriesRef.current.get(key)
      if (entry) {
        clearTimeout(entry.timer)
        entriesRef.current.delete(key)
        sync()
      }
    },
    [sync],
  )

  const cancelAll = useCallback(() => {
    for (const entry of entriesRef.current.values()) clearTimeout(entry.timer)
    entriesRef.current.clear()
    setPendingCount(0)
  }, [])

  const schedule = useCallback(
    (key: string, run: () => void, options?: { persists?: boolean }) => {
      const existing = entriesRef.current.get(key)
      if (existing) clearTimeout(existing.timer)

      const timer = setTimeout(() => {
        entriesRef.current.delete(key)
        sync()
        run()
      }, delayMs)
      entriesRef.current.set(key, { timer, persists: options?.persists ?? true })
      sync()
    },
    [delayMs, sync],
  )

  // Timers that outlive the page would call setState on an unmounted tree.
  useEffect(() => {
    const entries = entriesRef.current
    return () => {
      for (const entry of entries.values()) clearTimeout(entry.timer)
      entries.clear()
    }
  }, [])

  return { schedule, cancel, cancelAll, pendingCount }
}
