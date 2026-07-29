import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { middleware } from '@/middleware'

/**
 * The page half of the access policy. `/class-settings` assigns the
 * Klassenvorstand/Klassenleiter, and the class lead is the only teacher who may
 * lock a class's grades after the Sokrates transfer — so unlike every other
 * staff page it has to turn a plain teacher away, not just a signed-out visitor.
 */

vi.mock('next-auth/jwt', () => ({ getToken: vi.fn() }))

const request = (path: string) => new NextRequest(`http://localhost${path}`)

const asRole = (role: string | null) =>
  vi.mocked(getToken).mockResolvedValue(role === null ? null : ({ role } as never))

describe('middleware page guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each(['user', 'student', 'teacher'])(
    'redirects a %s away from /class-settings',
    async role => {
      asRole(role)

      const response = await middleware(request('/class-settings'))

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost/')
    },
  )

  it('redirects a signed-out visitor away from /class-settings', async () => {
    asRole(null)

    const response = await middleware(request('/class-settings'))

    expect(response.headers.get('location')).toBe('http://localhost/')
  })

  it('lets an admin through to /class-settings', async () => {
    asRole('admin')

    const response = await middleware(request('/class-settings'))

    expect(response.headers.get('location')).toBeNull()
  })

  it('still admits a teacher to the staff pages', async () => {
    asRole('teacher')

    for (const path of ['/notensammler', '/noten', '/schedule/create']) {
      const response = await middleware(request(path))
      expect(response.headers.get('location'), path).toBeNull()
    }
  })

  it('turns a student away from the staff pages', async () => {
    asRole('student')

    const response = await middleware(request('/notensammler'))

    expect(response.headers.get('location')).toBe('http://localhost/')
  })
})
