import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAdmin } from '@/lib/require-admin'
import { getNotificationSettings, setEmailDigestEnabled } from '@/lib/notification-settings'
import { GET, PUT } from '../route'

vi.mock('@/lib/require-admin', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/notification-settings', () => ({
  getNotificationSettings: vi.fn(),
  setEmailDigestEnabled: vi.fn(),
}))

const settings = {
  emailDigestEnabled: false,
  lastDigestRunAt: null,
  lastDigestStatus: null,
  lastDigestSummary: null,
}

const put = (body: unknown) =>
  new Request('http://localhost/api/admin/notification-settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  })

describe('/api/admin/notification-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAdmin).mockResolvedValue({ ok: true, session: {} } as never)
    vi.mocked(getNotificationSettings).mockResolvedValue(settings)
    vi.mocked(setEmailDigestEnabled).mockResolvedValue({ ...settings, emailDigestEnabled: true })
  })

  it('GET returns the settings for an admin', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(settings)
  })

  it('GET is 403 for a non-admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as never)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('PUT flips the switch', async () => {
    const res = await PUT(put({ emailDigestEnabled: true }))
    expect(res.status).toBe(200)
    expect(setEmailDigestEnabled).toHaveBeenCalledWith(true)
    expect((await res.json()).emailDigestEnabled).toBe(true)
  })

  it('PUT rejects a non-boolean value', async () => {
    const res = await PUT(put({ emailDigestEnabled: 'yes' }))
    expect(res.status).toBe(400)
    expect(setEmailDigestEnabled).not.toHaveBeenCalled()
  })

  it('PUT is 403 for a non-admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ ok: false } as never)
    const res = await PUT(put({ emailDigestEnabled: true }))
    expect(res.status).toBe(403)
  })
})
