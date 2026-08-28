import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runFullDirectorySync } from '@/lib/directory-sync'
import { POST } from '../route'

vi.mock('@/lib/directory-sync', () => ({ runFullDirectorySync: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const SECRET = 'top-secret'

const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/sync/run', { method: 'POST', headers })

describe('POST /api/sync/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SYNC_TRIGGER_SECRET = SECRET
    vi.mocked(runFullDirectorySync).mockResolvedValue({
      status: 'success',
    } as never)
  })

  afterEach(() => {
    delete process.env.SYNC_TRIGGER_SECRET
  })

  it('is 503 when no secret is configured and never syncs', async () => {
    delete process.env.SYNC_TRIGGER_SECRET
    const res = await POST(request({ 'x-sync-secret': SECRET }))
    expect(res.status).toBe(503)
    expect(runFullDirectorySync).not.toHaveBeenCalled()
  })

  it('is 401 with a wrong secret and never syncs', async () => {
    const res = await POST(request({ 'x-sync-secret': 'wrong' }))
    expect(res.status).toBe(401)
    expect(runFullDirectorySync).not.toHaveBeenCalled()
  })

  it('is 401 with no secret header at all and never syncs', async () => {
    const res = await POST(request())
    expect(res.status).toBe(401)
    expect(runFullDirectorySync).not.toHaveBeenCalled()
  })

  it('is 401 with a secret of the wrong length (timingSafeEqual guard) and never syncs', async () => {
    const res = await POST(request({ 'x-sync-secret': `${SECRET}-extra` }))
    expect(res.status).toBe(401)
    expect(runFullDirectorySync).not.toHaveBeenCalled()
  })

  it('accepts the x-sync-secret header and runs the sync', async () => {
    const res = await POST(request({ 'x-sync-secret': SECRET }))
    expect(res.status).toBe(200)
    expect(runFullDirectorySync).toHaveBeenCalledWith({ trigger: 'scheduled' })
  })

  it('accepts a bearer token too', async () => {
    const res = await POST(request({ authorization: `Bearer ${SECRET}` }))
    expect(res.status).toBe(200)
    expect(runFullDirectorySync).toHaveBeenCalled()
  })

  it('maps a failed run to 500 and a partial run to 207', async () => {
    vi.mocked(runFullDirectorySync).mockResolvedValue({ status: 'failed' } as never)
    expect((await POST(request({ 'x-sync-secret': SECRET }))).status).toBe(500)

    vi.mocked(runFullDirectorySync).mockResolvedValue({ status: 'partial' } as never)
    expect((await POST(request({ 'x-sync-secret': SECRET }))).status).toBe(207)
  })
})
