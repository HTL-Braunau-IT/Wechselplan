import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/server/send-support-email-graph'
import { recordDigestRun } from '@/lib/notification-settings'
import { DIGEST_AGE_HOURS, runNotificationDigest } from '@/lib/notification-digest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notification: { findMany: vi.fn(), updateMany: vi.fn() },
  },
}))
vi.mock('@/server/send-support-email-graph', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/notification-settings', () => ({ recordDigestRun: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const now = new Date('2026-03-10T09:00:00.000Z')

const row = (
  id: number,
  recipientId: number,
  recipient: { email: string | null; isActive: boolean; firstName: string },
  overrides: Record<string, unknown> = {},
) => ({
  id,
  recipientId,
  type: 'grades-entered',
  params: { className: '1AHIT', count: 1 },
  createdAt: new Date('2026-03-01T09:00:00.000Z'),
  recipient,
  ...overrides,
})

describe('runNotificationDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(sendEmail).mockResolvedValue(undefined as never)
    vi.mocked(recordDigestRun).mockResolvedValue(undefined as never)
  })

  it('only queries unread, un-digested rows older than the 24h cutoff', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([] as never)

    await runNotificationDigest(now)

    const cutoff = new Date(now.getTime() - DIGEST_AGE_HOURS * 60 * 60 * 1000)
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { readAt: null, digestedAt: null, createdAt: { lt: cutoff } },
      }),
    )
  })

  it('emails one digest per teacher and marks their rows digested', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      row(1, 10, { email: 'anna@example.at', isActive: true, firstName: 'Anna' }),
      row(2, 10, { email: 'anna@example.at', isActive: true, firstName: 'Anna' }),
      row(3, 20, { email: 'ben@example.at', isActive: true, firstName: 'Ben' }),
    ] as never)

    const summary = await runNotificationDigest(now)

    expect(summary).toMatchObject({
      teachersEmailed: 2,
      notificationsIncluded: 3,
      teachersWithoutEmail: 0,
      failures: 0,
    })
    expect(sendEmail).toHaveBeenCalledTimes(2)
    // Anna's mail names her count and lists rendered lines.
    const [, subject, body] = vi.mocked(sendEmail).mock.calls[0]!
    expect(subject).toContain('2')
    expect(body).toContain('Anna')
    expect(body).toContain('Note in 1AHIT eingetragen')
    // Both of Anna's rows get marked in one update.
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      data: { digestedAt: now },
    })
    expect(recordDigestRun).toHaveBeenCalledWith(
      expect.objectContaining({ runAt: now, status: 'ok' }),
    )
  })

  it('skips a teacher with no e-mail address without marking their rows', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      row(1, 10, { email: null, isActive: true, firstName: 'Anna' }),
    ] as never)

    const summary = await runNotificationDigest(now)

    expect(summary.teachersWithoutEmail).toBe(1)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(prisma.notification.updateMany).not.toHaveBeenCalled()
  })

  it('skips a deactivated teacher entirely', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      row(1, 10, { email: 'gone@example.at', isActive: false, firstName: 'Gone' }),
    ] as never)

    const summary = await runNotificationDigest(now)

    expect(summary).toMatchObject({ teachersEmailed: 0, teachersWithoutEmail: 0 })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(prisma.notification.updateMany).not.toHaveBeenCalled()
  })

  it('leaves a failed teacher un-digested and reports the run as partial', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([
      row(1, 10, { email: 'anna@example.at', isActive: true, firstName: 'Anna' }),
    ] as never)
    vi.mocked(sendEmail).mockRejectedValue(new Error('smtp down'))

    const summary = await runNotificationDigest(now)

    expect(summary.failures).toBe(1)
    expect(summary.teachersEmailed).toBe(0)
    expect(prisma.notification.updateMany).not.toHaveBeenCalled()
    expect(recordDigestRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'partial' }),
    )
  })
})
