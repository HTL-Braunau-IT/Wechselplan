import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { PATCH } from '../route'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * `classLeadId` decides who may mark a class as entered into Sokrates and
 * thereby lock every teacher's grades, so this handler must ask for the *admin*
 * tier — it used to ask for `staff`, which let any teacher appoint themselves
 * lead of any class. `route-guards.test.ts` only proves a guard is present, and
 * `api-access.test.ts` only proves the policy table; the tier the handler
 * actually passes is pinned here.
 */

const mockFindUnique = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: { findUnique: mockFindUnique, update: mockUpdate },
    teacher: { findUnique: vi.fn(async () => ({ id: 12 })) },
  },
}))

const patch = (body: unknown) =>
  PATCH(
    new Request('http://localhost/api/classes/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    { params: { id: '1' } },
  )

describe('PATCH /api/classes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(denyUnlessAccess).mockResolvedValue(null)
    mockFindUnique.mockResolvedValue({ id: 1, name: '1AHELS' })
    mockUpdate.mockResolvedValue({ id: 1, name: '1AHELS', classHeadId: null, classLeadId: 12 })
  })

  it('demands the admin tier, not staff', async () => {
    await patch({ classLeadId: 12 })

    expect(denyUnlessAccess).toHaveBeenCalledWith('admin')
  })

  it('writes nothing when the guard refuses', async () => {
    vi.mocked(denyUnlessAccess).mockResolvedValue(
      NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 }),
    )

    const response = await patch({ classLeadId: 12 })

    expect(response.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('updates the class lead for an admin', async () => {
    const response = await patch({ classLeadId: 12 })

    expect(response.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { classLeadId: 12 } }),
    )
  })
})
