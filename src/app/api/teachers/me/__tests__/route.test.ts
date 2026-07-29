import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { GET } from '../route'
import { denyUnlessAccess } from '@/lib/api-guard'
import { resolveSessionTeacher } from '@/lib/session-teacher'

/**
 * The endpoint exists so clients stop deriving their own Teacher row from
 * `session.user.name`. Two things are pinned here: it resolves through
 * `resolveSessionTeacher` (the OID-first lookup), and "this account has no
 * Teacher row" comes back as a 200 with `teacher: null` rather than an error —
 * callers treat a non-OK response as "could not tell", which is a different
 * state from "definitely not a teacher".
 */

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'oid-1' } })) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/session-teacher', () => ({ resolveSessionTeacher: vi.fn() }))

describe('GET /api/teachers/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(denyUnlessAccess).mockResolvedValue(null)
  })

  it('requires the staff tier', async () => {
    vi.mocked(resolveSessionTeacher).mockResolvedValue(null)

    await GET()

    expect(denyUnlessAccess).toHaveBeenCalledWith('staff')
  })

  it('does not resolve a teacher when the guard refuses', async () => {
    vi.mocked(denyUnlessAccess).mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    )

    const response = await GET()

    expect(response.status).toBe(403)
    expect(resolveSessionTeacher).not.toHaveBeenCalled()
  })

  it('returns the resolved teacher', async () => {
    vi.mocked(resolveSessionTeacher).mockResolvedValue({
      id: 7,
      firstName: 'Anna',
      lastName: 'Müller',
      username: 'anna.mueller',
      email: 'anna.mueller@example.at',
      // Fields the endpoint deliberately does not expose.
      externalId: 'oid-1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const response = await GET()
    const body = (await response.json()) as { teacher: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(body.teacher).toEqual({
      id: 7,
      firstName: 'Anna',
      lastName: 'Müller',
      username: 'anna.mueller',
      email: 'anna.mueller@example.at',
    })
  })

  it('reports "no teacher" as a 200, not a 404', async () => {
    vi.mocked(resolveSessionTeacher).mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ teacher: null })
  })
})
