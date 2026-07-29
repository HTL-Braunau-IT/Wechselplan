'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { captureFrontendError } from '@/lib/frontend-error'

export type CurrentTeacher = {
  id: number
  firstName: string
  lastName: string
  username: string
  email: string | null
}

/**
 * The Teacher record for the signed-in user, or `null` when the account has
 * none (admins, students, a teacher missing from the directory sync).
 *
 * Reads `/api/teachers/me`, which resolves the row from the session server-side.
 * Callers used to fetch `/api/teachers/by-username?username=${session.user.name}`
 * instead; post-Entra that name is the display name and the lookup fails, so the
 * page rendered as though the user taught nothing.
 */
export function useCurrentTeacher(): { teacher: CurrentTeacher | null; loading: boolean } {
  const { data: session, status } = useSession()
  const [teacher, setTeacher] = useState<CurrentTeacher | null>(null)
  const [loading, setLoading] = useState(true)

  const authenticated = status === 'authenticated' && Boolean(session?.user)

  useEffect(() => {
    if (status === 'loading') return
    if (!authenticated) {
      setTeacher(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const load = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/teachers/me', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) {
          if (!cancelled) setTeacher(null)
          return
        }
        const data = (await response.json()) as { teacher: CurrentTeacher | null }
        if (!cancelled) setTeacher(data.teacher ?? null)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        captureFrontendError(e, { location: 'use-current-teacher', type: 'fetch-current-teacher' })
        if (!cancelled) setTeacher(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [authenticated, status])

  return { teacher, loading }
}
