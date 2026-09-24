import { useEffect, useState } from 'react'
import { captureFrontendError } from '@/lib/frontend-error'

/** The Notenliste-derived term grade per semester, keyed by student id. */
export type NotenlisteSuggestion = { first: number | null; second: number | null }
export type NotenlisteSuggestions = Record<number, NotenlisteSuggestion>

/**
 * Loads the signed-in teacher's Notenliste (`/noten`) term-grade suggestions for
 * the open class. Best-effort: the entry screen works without it, so any failure
 * (feature off, not assigned, network) just leaves the map empty and the
 * "übernehmen" chips don't render — it never blocks grade entry.
 */
export function useNotenlisteSuggestions(
  selectedClassId: string,
  schoolYearId: number | undefined,
  /** The weekday whose grouping decides the group weights (groups are per weekday). */
  weekday: number | null = null,
): NotenlisteSuggestions {
  const [suggestions, setSuggestions] = useState<NotenlisteSuggestions>({})

  useEffect(() => {
    if (!selectedClassId || schoolYearId == null) {
      setSuggestions({})
      return
    }

    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(
          `/api/notensammler/notenliste-suggestions?classId=${selectedClassId}&schoolYearId=${schoolYearId}${
            weekday != null ? `&weekday=${weekday}` : ''
          }`,
          { cache: 'no-store', signal: controller.signal },
        )
        if (!response.ok) {
          setSuggestions({})
          return
        }
        const data = (await response.json()) as { suggestions?: Record<string, NotenlisteSuggestion> }
        const raw = data.suggestions ?? {}
        const normalized: NotenlisteSuggestions = {}
        for (const key of Object.keys(raw)) {
          const id = Number(key)
          if (Number.isNaN(id)) continue
          const value = raw[key]
          if (value) normalized[id] = { first: value.first ?? null, second: value.second ?? null }
        }
        setSuggestions(normalized)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        captureFrontendError(e, { location: 'notensammler', type: 'fetch-notenliste-suggestions' })
        setSuggestions({})
      }
    }

    void load()
    return () => controller.abort()
  }, [selectedClassId, schoolYearId, weekday])

  return suggestions
}
