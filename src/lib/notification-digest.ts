import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { sendEmail } from '@/server/send-support-email-graph'
import { renderNotificationLine } from '@/lib/notification-message'
import { recordDigestRun } from '@/lib/notification-settings'

/**
 * Daily e-mail digest of unacknowledged in-app notifications (issue #96).
 *
 * A teacher who leaves bell entries unread past {@link DIGEST_AGE_HOURS} gets one
 * plain-text summary mail of what they missed. Rows are marked `digestedAt` once
 * mailed, so the same missed notification is never sent twice even while it
 * stays unread; a row read before the run simply drops out of the query. Wholly
 * best-effort per teacher — one bad address never blocks the rest.
 */

/** How long a notification may sit unread before it lands in the next digest. */
export const DIGEST_AGE_HOURS = 24

/** Guard against a pathological mail: never list more than this many lines. */
const MAX_LINES_PER_EMAIL = 50

const formatDate = (date: Date): string =>
  date.toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Vienna',
  })

export interface DigestSummary {
  /** Teachers who received a digest mail. */
  teachersEmailed: number
  /** Notifications rolled into a sent digest (and marked digested). */
  notificationsIncluded: number
  /** Teachers with digestible rows but no address to mail — left for later. */
  teachersWithoutEmail: number
  /** Teachers whose mail send threw; their rows stay eligible for the next run. */
  failures: number
}

/**
 * Builds and sends the digest. Assumes the caller has already checked the master
 * switch; call {@link isEmailDigestEnabled} first from the route.
 *
 * @param now injectable clock, so a test can pin the 24-hour cutoff.
 */
export async function runNotificationDigest(now: Date = new Date()): Promise<DigestSummary> {
  const cutoff = new Date(now.getTime() - DIGEST_AGE_HOURS * 60 * 60 * 1000)

  // Every unread, not-yet-digested row old enough to count, with just enough of
  // the recipient to decide whether (and where) to mail them.
  const rows = await prisma.notification.findMany({
    where: { readAt: null, digestedAt: null, createdAt: { lt: cutoff } },
    orderBy: [{ recipientId: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      recipientId: true,
      type: true,
      params: true,
      createdAt: true,
      recipient: { select: { email: true, isActive: true, firstName: true } },
    },
  })

  // Group by recipient in one pass (rows are already ordered by recipientId).
  const byRecipient = new Map<
    number,
    { email: string | null; isActive: boolean; firstName: string; rows: typeof rows }
  >()
  for (const row of rows) {
    let bucket = byRecipient.get(row.recipientId)
    if (!bucket) {
      bucket = {
        email: row.recipient.email,
        isActive: row.recipient.isActive,
        firstName: row.recipient.firstName,
        rows: [],
      }
      byRecipient.set(row.recipientId, bucket)
    }
    bucket.rows.push(row)
  }

  const summary: DigestSummary = {
    teachersEmailed: 0,
    notificationsIncluded: 0,
    teachersWithoutEmail: 0,
    failures: 0,
  }

  for (const bucket of byRecipient.values()) {
    // A deactivated teacher's rows are left untouched — they cannot sign in to
    // read them and should not be mailed either.
    if (!bucket.isActive) continue
    if (!bucket.email) {
      summary.teachersWithoutEmail += 1
      continue
    }

    const lines: string[] = []
    for (const row of bucket.rows) {
      const text = renderNotificationLine(row.type, row.params)
      if (text) lines.push(`• ${text} (${formatDate(row.createdAt)})`)
    }
    // Nothing renderable (all rows were unknown types) → skip, but mark them
    // digested so we do not re-scan them forever.
    if (lines.length === 0) {
      await markDigested(
        bucket.rows.map(r => r.id),
        now,
      )
      continue
    }

    const shown = lines.slice(0, MAX_LINES_PER_EMAIL)
    const overflow = lines.length - shown.length
    const subject = `Wechselplan: ${bucket.rows.length} ungelesene Benachrichtigung(en)`
    const body = [
      `Hallo ${bucket.firstName},`,
      '',
      `du hast ${bucket.rows.length} ungelesene Benachrichtigung(en) in Wechselplan, die seit mehr als ${DIGEST_AGE_HOURS} Stunden offen sind:`,
      '',
      ...shown,
      ...(overflow > 0 ? ['', `… und ${overflow} weitere.`] : []),
      '',
      'Öffne Wechselplan, um sie anzusehen und zu bestätigen.',
    ].join('\n')

    try {
      await sendEmail(bucket.email, subject, body)
      await markDigested(
        bucket.rows.map(r => r.id),
        now,
      )
      summary.teachersEmailed += 1
      summary.notificationsIncluded += bucket.rows.length
    } catch (error) {
      // Leave the rows un-digested so the next run retries them.
      summary.failures += 1
      captureError(error as Error, {
        location: 'lib/notification-digest',
        type: 'send-digest',
      })
    }
  }

  await recordDigestRun({
    runAt: now,
    status: summary.failures > 0 ? 'partial' : 'ok',
    summary: { ...summary },
  })

  return summary
}

async function markDigested(ids: number[], now: Date): Promise<void> {
  if (ids.length === 0) return
  await prisma.notification.updateMany({
    where: { id: { in: ids } },
    data: { digestedAt: now },
  })
}
