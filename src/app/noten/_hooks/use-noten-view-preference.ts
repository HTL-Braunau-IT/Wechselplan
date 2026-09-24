import { useCallback, useEffect, useRef, useState } from 'react'
import { captureFrontendError } from '@/lib/frontend-error'

/**
 * The teacher's personal Noten view preferences (per teacher, not scoped by
 * class or year). Currently just whether the Sitzplan view opens by default.
 *
 * Loaded once on mount. `loaded` lets the UI wait for the saved value before
 * seeding local view state, so the preference isn't briefly overridden by a
 * default on first paint. Writes are optimistic and best-effort — a failed save
 * only means the choice isn't remembered next time, so it never surfaces an error.
 */
export function useNotenViewPreference() {
  const [seatingDefault, setSeatingDefault] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/noten/view-preference')
      .then(async res => {
        if (!res.ok) throw new Error('Load failed')
        return res.json() as Promise<{ seatingModeDefault?: boolean }>
      })
      .then(data => {
        if (cancelled) return
        setSeatingDefault(!!data.seatingModeDefault)
      })
      .catch((err: unknown) => {
        captureFrontendError(err, { location: 'noten', type: 'load-view-preference' })
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Avoid re-POSTing the same value (e.g. the seed echoing back on first toggle).
  const lastSaved = useRef<boolean | null>(null)

  const saveSeatingDefault = useCallback((value: boolean) => {
    setSeatingDefault(value)
    if (lastSaved.current === value) return
    lastSaved.current = value
    void fetch('/api/noten/view-preference', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seatingModeDefault: value }),
    })
      .then(res => {
        if (!res.ok) throw new Error('Save failed')
      })
      .catch((err: unknown) => {
        captureFrontendError(err, { location: 'noten', type: 'save-view-preference' })
      })
  }, [])

  return { seatingDefault, loaded, saveSeatingDefault }
}
