import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isEmailDigestEnabled } from '@/lib/notification-settings'
import { runNotificationDigest } from '@/lib/notification-digest'
import { POST } from '../route'

vi.mock('@/lib/notification-settings', () => ({ isEmailDigestEnabled: vi.fn() }))
vi.mock('@/lib/notification-digest', () => ({ runNotificationDigest: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const SECRET = 'top-secret'

const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/notifications/digest/run', { method: 'POST', headers })

describe('POST /api/notifications/digest/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SYNC_TRIGGER_SECRET = SECRET
    vi.mocked(isEmailDigestEnabled).mockResolvedValue(true)
    vi.mocked(runNotificationDigest).mockResolvedValue({
      teachersEmailed: 1,
      notificationsIncluded: 2,
      teachersWithoutEmail: 0,
      failures: 0,
    })
  })

  afterEach(() => {
    delete process.env.SYNC_TRIGGER_SECRET
  })

  it('is 503 when no secret is configured', async () => {
    delete process.env.SYNC_TRIGGER_SECRET
    const res = await POST(request({ 'x-sync-secret': SECRET }))
    expect(res.status).toBe(503)
    expect(runNotificationDigest).not.toHaveBeenCalled()
  })

  it('is 401 without the right secret', async () => {
    const res = await POST(request({ 'x-sync-secret': 'wrong' }))
    expect(res.status).toBe(401)
    expect(runNotificationDigest).not.toHaveBeenCalled()
  })

  it('accepts a bearer token too', async () => {
    const res = await POST(request({ authorization: `Bearer ${SECRET}` }))
    expect(res.status).toBe(200)
    expect(runNotificationDigest).toHaveBeenCalled()
  })

  it('skips without running when the master switch is off', async () => {
    vi.mocked(isEmailDigestEnabled).mockResolvedValue(false)
    const res = await POST(request({ 'x-sync-secret': SECRET }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.skipped).toBe(true)
    expect(runNotificationDigest).not.toHaveBeenCalled()
  })

  it('runs the digest when authorised and enabled', async () => {
    const res = await POST(request({ 'x-sync-secret': SECRET }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.skipped).toBe(false)
    expect(body.summary.teachersEmailed).toBe(1)
  })

  it('reports 207 when some sends failed', async () => {
    vi.mocked(runNotificationDigest).mockResolvedValue({
      teachersEmailed: 1,
      notificationsIncluded: 2,
      teachersWithoutEmail: 0,
      failures: 1,
    })
    const res = await POST(request({ 'x-sync-secret': SECRET }))
    expect(res.status).toBe(207)
  })
})
